# Telegram Drive (Ad-Free & Hardened Edition)

**Telegram Drive** is a secure, high-performance cross-platform desktop application that turns your Telegram account into an unlimited cloud storage drive. Built with **Tauri v2**, **Rust**, and **React**.

This version has been custom-modified to be **100% ad-free**, **security-hardened**, and packed with rich media management capabilities for personal use.

---

## 📥 Direct Download & Releases

Get pre-compiled desktop installers for your operating system directly from GitHub Releases:

* 🪟 **Windows**: Download `Telegram-Drive_x64-setup.exe` or `.msi`
* 🍏 **macOS**: Download `Telegram-Drive.dmg` or `.app.tar.gz` (Apple Silicon & Intel)
* 🐧 **Linux**: Download `Telegram-Drive.AppImage` or `.deb`

👉 **[Download Latest Release (v2.0.1)](https://github.com/chauhan-pratham/Telegram-Drive/releases/latest)**

---

## 📸 Screenshots

### 🖥️ File Explorer & Storage Management
![File Explorer](https://raw.githubusercontent.com/chauhan-pratham/Telegram-Drive/main/public/screenshots/explorer.png)

<br />

### ⚙️ Application Settings & Configuration
![Settings](https://raw.githubusercontent.com/chauhan-pratham/Telegram-Drive/main/public/screenshots/settings.png)

---

## ✨ Key Features

* **Unlimited Cloud Storage**: Harnesses Telegram's infrastructure to store, organize, and manage your files and folders with real-time total storage usage tracking.
* **🗂️ Multi-Tab Organization**: Effortlessly switch between **My Drive**, **Shared with me**, **Recent**, **Starred**, **Offline**, and **Trash** tabs.
* **⭐ File & Folder Starring**: Easily star/unstar files and folders from the top action bar, context menu, or details panel, and view them instantly in the **Starred** tab.
* **🔒 Extension-Locked File Renaming**: Extension-safe file renaming modal for Desktop and Mobile that keeps extension suffixes locked and untouched while allowing clean basename edits.
* **🛡️ Disguised Executable Pre-Flight Security**: Magic byte inspection (`MZ` / `ELF`) that automatically detects disguised executable binaries (`.exe`, `.elf`) and displays a Red Security Alert Protection Card with safe download options.
* **🔍 Image Magnifier & Interactive Zoom System**: Smooth 50%–500% wheel zooming, click-and-drag panning, 90° rotation, double-click quick zoom, touch gestures, and keyboard shortcuts (`+`, `-`, `0`).
* **🎨 Unified Sleek Dark Viewers Header**: Standardized top navigation header (`bg-[#161619]`) with uniform icon sizes and action buttons across all file viewers (Text, PDF, Video, Audio, Office, Images).
* **🎬 Adaptive HLS Video Streaming & Transcoding**: Stream videos on-the-fly with multi-quality resolution options (360p, 480p, 720p, 1080p, and Original) powered by a local Rust/Actix proxy with HLS caching.
* **📦 Folder Upload (ZIP) & File Drag-and-Drop**: Upload single/multiple files or compress and upload entire folders directly with live upload/download progress queues.
* **📱 Responsive Mobile & Touch View**: Adaptive UI with touch-friendly navigation, bottom navigation bar, swipe sheets, and mobile action popovers.
* **📈 Daily Bandwidth & Storage Analytics**: Integrated sidebar widget displaying real-time daily upload/download bandwidth stats and storage consumption.
* **📄 Aspect-Ratio Locked PDF Viewer**: Fluid, zero-jitter PDF reader with aspect-ratio container height locks for smooth, fast scrolling without layout collapse.
* **📁 Smart Folder Metadata & Grid Alignment**: Real-time folder size calculations, item counts (`14.2 MB` / `3 items`), category tags, and pixel-perfect 5-column table alignment with expanded timestamps.
* **📂 External File Opener**: Open downloaded files directly in your operating system's default desktop applications from download toasts or the Download Queue widget.
* **⌨️ Keyboard & Gesture Navigation**: Quick `Escape` key dismissal for modals and context menus, 3-dots popover toggling, drag-and-drop file organization, and auto-naming fallbacks.
* **📊 Live Activity Audit Feed**: Inspect detailed file metadata, Telegram Message IDs, upload timestamps, storage sizes, and channel mappings in the interactive **Details** panel.
* **🌐 Proxy & VPN Optimization**: Configurable SOCKS5 / MTProto proxy settings, adjustable chunk sizes, bandwidth limits, and keep-alives for high-latency connections.
* **🚫 100% Ad-Free**: Completely stripped of all third-party tracking, Adsterra, AdMob scripts, network gateways, and pop-up banners.
* **🔒 Hardened Security & Safe Environment Builds**: Strict Content Security Policy (CSP) blocking remote cross-site script execution, with custom environment-aware build scripts (`npm run tauri:build`).

---

## 🛠️ Getting Started

### Prerequisites

Before compiling or running the application, ensure you have the following installed:

1. **Node.js (v18+)**
2. **Rust (Latest stable)** via [rustup.rs](https://rustup.rs/)
3. **C++ Build Tools (Tauri requirement):**
   * **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select the **"Desktop development with C++"** workload.
   * **macOS:** Install Xcode Command Line Tools (`xcode-select --install`).
   * **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`

### Telegram API Credentials

You will need your own Telegram API credentials:
1. Log in to [my.telegram.org](https://my.telegram.org).
2. Go to **API development tools** and create a new application to obtain your `api_id` and `api_hash`.

---

## 🚀 Running the App

1. **Install Dependencies:**
   Navigate to the `app/` directory and install npm packages:
   ```bash
   cd app
   npm install
   ```

2. **Run in Development Mode:**
   Starts Vite dev server and launches the Tauri desktop app:
   ```bash
   npm run tauri dev
   ```

3. **Compile Production Binary:**
   Generates a production build installer (`.exe` for Windows, `.app`/`.dmg` for macOS, or `.AppImage` for Linux) while automatically loading environment variables from `.env`:
   ```bash
   npm run tauri:build
   ```

4. **Security Audit Check:**
   Runs static security analysis, secret leak scans, and dependency vulnerability checks:
   ```bash
   npm run security-check
   ```

---

## 🔒 Security & Privacy Notice

* **Local Processing:** All Telegram API keys, login credentials, and session data (`telegram.session`) remain strictly local on your machine.
* **Local Proxy Binding:** The Actix HTTP streaming proxy binds solely to `127.0.0.1` (localhost) secured by single-session access tokens.
* **Zero Telemetry:** No user data, analytics, or external telemetry is collected. Communications occur directly with official Telegram servers.
