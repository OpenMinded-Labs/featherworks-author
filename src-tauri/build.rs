fn main() {
    // Set macOS deployment target for llama-cpp compatibility
    // Requires macOS 10.15+ for std::filesystem support
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-env=MACOSX_DEPLOYMENT_TARGET=11.0");
        // SAFETY: Setting env var before any threads are spawned
        unsafe { std::env::set_var("MACOSX_DEPLOYMENT_TARGET", "11.0"); }
    }
    
    tauri_build::build()
}
