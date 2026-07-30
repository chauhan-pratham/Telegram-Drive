use log::{LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

struct FileLogger {
    file: Mutex<File>,
}

impl Log for FileLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= log::Level::Trace
    }

    fn log(&self, record: &Record<'_>) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();

        if let Ok(mut file) = self.file.lock() {
            let _ = writeln!(
                file,
                "{} {:?} {} [{}] {}",
                timestamp,
                std::thread::current().id(),
                record.level(),
                record.target(),
                record.args()
            );
            let _ = file.flush();
        }
    }

    fn flush(&self) {
        if let Ok(mut file) = self.file.lock() {
            let _ = file.flush();
        }
    }
}

static LOGGER: OnceLock<FileLogger> = OnceLock::new();

pub fn init(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let log_dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join("logs");
    fs::create_dir_all(&log_dir).map_err(|error| error.to_string())?;

    let log_path = log_dir.join("telegram-drive.log");
    if fs::metadata(&log_path).map(|metadata| metadata.len() > MAX_LOG_BYTES).unwrap_or(false) {
        let previous_path = log_dir.join("telegram-drive.previous.log");
        let _ = fs::remove_file(&previous_path);
        fs::rename(&log_path, previous_path).map_err(|error| error.to_string())?;
    }

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| error.to_string())?;

    LOGGER
        .set(FileLogger { file: Mutex::new(file) })
        .map_err(|_| "Diagnostic logger is already initialized".to_string())?;
    log::set_logger(LOGGER.get().expect("diagnostic logger was initialized"))
        .map_err(|error| error.to_string())?;
    log::set_max_level(LevelFilter::Info);

    let previous_panic_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        log::error!("Unhandled backend panic: {}", panic_info);
        previous_panic_hook(panic_info);
    }));

    Ok(log_path)
}
