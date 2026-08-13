use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    #[error("Datenbankfehler: {0}")]
    Db(String),
    #[error("Verschlüsselung fehlgeschlagen: {0}")]
    Crypto(String),
    #[error("Allgemeiner Fehler: {0}")]
    General(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<String> for AppError {
    fn from(value: String) -> Self {
        AppError::General(value)
    }
}

impl From<&str> for AppError {
    fn from(value: &str) -> Self {
        AppError::General(value.to_string())
    }
}
