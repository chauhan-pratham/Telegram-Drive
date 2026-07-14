# Telegram Drive (Ad-Free & Hardened Edition)

**Telegram Drive** is a secure, cross-platform desktop application that turns your Telegram account into an unlimited cloud storage drive. Built with **Tauri v2**, **Rust**, and **React**.

This version has been custom-modified to be **completely ad-free** and **security-hardened** for personal use.

---

## ✨ Features

*   **Unlimited Cloud Storage**: Utilizes Telegram's cloud infrastructure to store and organize your files.
*   **Media Streaming**: Stream audio and video files directly from Telegram without full downloads (utilizes a secure local streaming server).
*   **Built-in PDF Viewer**: Infinite-scroll PDF reader integrated directly into the app.
*   **Drag & Drop**: Intuitive drag-and-drop upload and file management interface.
*   **Proxy Support**: SOCKS5 and MTProto proxy configuration to bypass regional blocks.
*   **VPN Optimizer**: Adjustable chunk sizes, bandwidth limits, and keep-alives for high-latency connections.
*   **100% Ad-Free**: All Adsterra and AdMob scripts, gateways, and pop-up banners have been completely stripped from the frontend and backend.
*   **Harden Security**: Content Security Policy (CSP) tightened to block all remote scripts, remote frames, and cross-site execution.

---

## 🛠️ Getting Started

### Prerequisites

Before compiling or running the app, ensure you have the following installed:

1.  **Node.js (v18+)**
2.  **Rust (Latest stable)** via [rustup.rs](https://rustup.rs/)
3.  **C++ Build Tools (Tauri requirement):**
    *   **Windows:** Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and select the **"Desktop development with C++"** workload.
    *   **macOS:** Install Xcode Command Line Tools (`xcode-select --install`).
    *   **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev`

### Telegram API Credentials

You will need your own API credentials to communicate with Telegram:
1.  Log in to [my.telegram.org](https://my.telegram.org).
2.  Go to **API development tools** and create a new application to obtain your `api_id` and `api_hash`.

---

## 🚀 Running the App

1.  **Install Frontend & Build Dependencies:**
    Navigate to the `app/` directory and install the packages:
    ```bash
    cd app
    npm install
    ```

2.  **Run in Development Mode:**
    Starts the local dev server and compiles the Tauri desktop app:
    ```bash
    npm run tauri dev
    ```

3.  **Compile Production App:**
    Generates a production-ready compiled package (installer `.exe` for Windows, bundle `.app`/`.dmg` for macOS, or `.AppImage` for Linux):
    ```bash
    npm run tauri build
    ```

---

## 🔒 Security & Privacy Notice

*   **Local Processing:** All your Telegram API keys, login credentials, and session files (`telegram.session`) are stored strictly locally on your machine.
*   **Local Binding:** The Actix HTTP streaming proxy binds solely to `127.0.0.1` (localhost) and is secured with dynamically generated, single-session access tokens.
*   **No Telemetry:** This fork contains zero telemetry, tracking, or network callbacks other than directly communicating with the official Telegram API.
