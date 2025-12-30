# accessibility-project-tsa26

TSA 2025–2026 project developing a cross-platform accessibility platform for users with vision and hearing disabilities. Features include real-time captions, audio descriptions, device integration, personalization, and privacy-first local processing.

## Clone & open in VS Code

### Option A — VS Code UI (recommended)

1. Open VS Code.
2. Press `Ctrl+Shift+P` (Windows) / `Cmd+Shift+P` (macOS).
3. Run: `Git: Clone`
4. Paste the repository URL and choose a folder:

```text
https://github.com/bvrtoverfitprimes/accessibility-project-tsa26
```

5. When prompted, click **Open**.

### Option B — Terminal

```bash
git clone https://github.com/bvrtoverfitprimes/accessibility-project-tsa26
cd accessibility-project-tsa26
code .
```

## Running the project

You can run the web UI in two common ways:

### 1) Live Server (static pages)

This is useful if you just want to view the HTML pages.

1. Install the VS Code extension **Live Server**.
2. Open `index.html` in VS Code.
3. Right-click inside the file and choose **Open with Live Server**.

### 2) Local Node server (recommended for full app)

This runs the Node/Express server and serves the site from `http://localhost:3000`.

## Local development

This project includes a simple Node.js server for local development with a lightweight SQLite user store.

### Install

1. Ensure Node.js is installed.
2. From the project root run:

```bash
npm install
```

### Run

```bash
npm start
```

Server will run on http://localhost:3000.

The app serves static files and provides endpoints:
- `POST /signup` — creates a user (redirects to offerings on success)
- `POST /login` — logs in a user (redirects to offerings on success)

User data is stored in `users.db` in the project root (SQLite). This file is ignored by git and is intended for local development/testing only.

## Running the Python tools (downloads)

The `downloads/` folder includes standalone Python scripts. After cloning/downloading the repo, you can run them from a terminal.

### Windows (PowerShell)

1. Open PowerShell.
2. `cd` into the repo folder.
3. Run a script with:

```powershell
python .\downloads\magnifier_universal.py
```

If `python` is not found, try:

```powershell
py .\downloads\magnifier_universal.py
```

If you prefer using a full file path:

```powershell
python "C:\Users\YourName\path\to\accessibility-project-tsa26\downloads\magnifier_universal.py"
```

### macOS (Terminal)

1. Open Terminal.
2. `cd` into the repo folder.
3. Run a script with:

```bash
python3 ./downloads/magnifier_universal.py
```

If you installed Python as `python`, you can also try:

```bash
python ./downloads/magnifier_universal.py
```
