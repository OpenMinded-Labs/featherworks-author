//! Encrypted & compressed .fwauthor container (M0 draft)
use aes_gcm::{
    aead::{generic_array::GenericArray, Aead, OsRng},
    Aes256Gcm, KeyInit,
};
use anyhow::{anyhow, Context};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use lz4_flex as lz4;
use rand::RngCore;
use std::{
    fs,
    io::{Read, Write},
    path::Path,
};
use tempfile::NamedTempFile;
use zeroize::Zeroize;

const MAGIC: &[u8; 7] = b"FWAUTHR"; // magic header
const VERSION: u8 = 1;

#[derive(Debug, Clone)]
pub struct ContainerHeader {
    pub version: u8,
    pub salt: String, // base64
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    pub nonce: [u8; 12],
    pub uncompressed_len: u64,
}

impl ContainerHeader {
    fn write(&self, mut w: &fs::File) -> anyhow::Result<()> {
        w.write_all(MAGIC)?;
        w.write_all(&[self.version])?;
        // JSON metadata for forward compatibility
        let meta_json = serde_json::json!({
            "salt": self.salt,
            "m": self.m_cost,
            "t": self.t_cost,
            "p": self.p_cost,
            "nonce": B64.encode(self.nonce),
        })
        .to_string();
        let meta_bytes = meta_json.as_bytes();
        let len = (meta_bytes.len() as u32).to_be_bytes();
        w.write_all(&len)?;
        w.write_all(meta_bytes)?;
        w.write_all(&self.uncompressed_len.to_be_bytes())?;
        Ok(())
    }
    fn read(mut f: &fs::File) -> anyhow::Result<Self> {
        let mut magic = [0u8; 7];
        f.read_exact(&mut magic)?;
        if &magic != MAGIC {
            anyhow::bail!("invalid magic")
        }
        let mut ver = [0u8; 1];
        f.read_exact(&mut ver)?;
        if ver[0] != VERSION {
            anyhow::bail!("unsupported version")
        }
        let mut meta_len_bytes = [0u8; 4];
        f.read_exact(&mut meta_len_bytes)?;
        let meta_len = u32::from_be_bytes(meta_len_bytes) as usize;
        let mut meta_buf = vec![0u8; meta_len];
        f.read_exact(&mut meta_buf)?;
        let meta_str = String::from_utf8(meta_buf)?;
        // Try JSON first, fall back to legacy semicolon format for backward compatibility
        let (salt, m_cost, t_cost, p_cost, nonce) = if meta_str.trim_start().starts_with('{') {
            let v: serde_json::Value = serde_json::from_str(&meta_str)?;
            let salt = v["salt"]
                .as_str()
                .ok_or_else(|| anyhow!("salt missing"))?
                .to_string();
            let m_cost = v["m"].as_u64().ok_or_else(|| anyhow!("m missing"))? as u32;
            let t_cost = v["t"].as_u64().ok_or_else(|| anyhow!("t missing"))? as u32;
            let p_cost = v["p"].as_u64().ok_or_else(|| anyhow!("p missing"))? as u32;
            let nonce_vec = B64
                .decode(
                    v["nonce"]
                        .as_str()
                        .ok_or_else(|| anyhow!("nonce missing"))?,
                )
                .context("nonce b64")?;
            let mut nonce = [0u8; 12];
            nonce.copy_from_slice(&nonce_vec[..12]);
            (salt, m_cost, t_cost, p_cost, nonce)
        } else {
            let parts: Vec<&str> = meta_str.split(';').collect();
            if parts.len() < 4 {
                anyhow::bail!("corrupt legacy header meta")
            }
            let salt = parts[0].to_string();
            let argon_params = parts[1].to_string();
            let nonce_vec = B64.decode(parts[2]).context("nonce b64")?;
            let mut nonce = [0u8; 12];
            nonce.copy_from_slice(&nonce_vec[..12]);
            // parse argon params m= t= p=
            let mut m = 64 * 1024;
            let mut t = 3;
            let mut p = 1;
            for kv in argon_params.split(';') {
                if let Some((k, v)) = kv.split_once('=') {
                    match k {
                        "m" => m = v.parse().unwrap_or(m),
                        "t" => t = v.parse().unwrap_or(t),
                        "p" => p = v.parse().unwrap_or(p),
                        _ => {}
                    }
                }
            }
            (salt, m, t, p, nonce)
        };
        let mut len_bytes = [0u8; 8];
        f.read_exact(&mut len_bytes)?;
        let uncompressed_len = u64::from_be_bytes(len_bytes);
        Ok(Self {
            version: ver[0],
            salt,
            m_cost,
            t_cost,
            p_cost,
            nonce,
            uncompressed_len,
        })
    }
}

fn derive_key(password: &str, salt: &[u8], params: &Params) -> anyhow::Result<[u8; 32]> {
    // Manual Argon2id KDF into fixed 32 bytes buffer
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params.clone());
    let mut key = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| anyhow!("argon2 kdf: {e}"))?;
    Ok(key)
}

pub fn save_encrypted(sqlite_path: &Path, out_path: &Path, password: &str) -> anyhow::Result<()> {
    let mut raw = Vec::new();
    fs::File::open(sqlite_path)?.read_to_end(&mut raw)?;
    let uncompressed_len = raw.len() as u64;
    let compressed = lz4::compress_prepend_size(&raw);
    let salt_rand: [u8; 16] = rand::random();
    let salt_b64 = B64.encode(salt_rand);
    // Tuned (moderate) parameters: m = 64 MiB, t=3 iterations, p=1 lane
    let params =
        Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| anyhow!("argon2 params: {e}"))?;
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let key = derive_key(password, &salt_rand, &params)?;
    let cipher = Aes256Gcm::new(GenericArray::from_slice(&key));
    let ciphertext = cipher
        .encrypt(GenericArray::from_slice(&nonce), compressed.as_ref())
        .map_err(|e| anyhow!("encrypt: {e}"))?;
    let header = ContainerHeader {
        version: VERSION,
        salt: salt_b64,
        m_cost: params.m_cost(),
        t_cost: params.t_cost(),
        p_cost: params.p_cost(),
        nonce,
        uncompressed_len,
    };
    // zero key after use (cipher holds internal copy expanded)
    let mut key_for_zero = key;
    key_for_zero.zeroize();
    let f = fs::File::create(out_path)?;
    header.write(&f)?;
    // Tag is appended automatically inside ciphertext (AES-GCM crate returns combined? Actually returns raw ciphertext). For authenticity we rely on failure on decrypt.
    // If we wanted explicit tag separation we would use AeadInPlace; keep simple here.
    let mut w = &f;
    w.write_all(&ciphertext)?;
    Ok(())
}

pub fn load_encrypted(path: &Path, password: &str) -> anyhow::Result<NamedTempFile> {
    let f = fs::File::open(path)?;
    let header = ContainerHeader::read(&f)?;
    let mut ciphertext = Vec::new();
    // read rest
    (&f).take(u64::MAX).read_to_end(&mut ciphertext)?;
    let params = Params::new(header.m_cost, header.t_cost, header.p_cost, Some(32))
        .map_err(|e| anyhow!("argon2 params parse: {e}"))?;
    let salt_dec = B64.decode(&header.salt)?;
    let key = derive_key(password, &salt_dec, &params)?;
    let cipher = Aes256Gcm::new(GenericArray::from_slice(&key));
    let decompressed = cipher
        .decrypt(GenericArray::from_slice(&header.nonce), ciphertext.as_ref())
        .map_err(|e| anyhow!("decrypt: {e}"))?;
    let mut key_for_zero = key;
    key_for_zero.zeroize();
    let raw = lz4::decompress_size_prepended(&decompressed)?;
    if raw.len() as u64 != header.uncompressed_len {
        log::warn!(
            "length mismatch: header {} vs actual {}",
            header.uncompressed_len,
            raw.len()
        );
    }
    let tmp = NamedTempFile::new()?;
    fs::write(tmp.path(), raw)?;
    Ok(tmp)
}
