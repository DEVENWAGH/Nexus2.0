# Nexus 3.0 — Quick Start Guide

Welcome to Nexus 3.0! Follow the simple steps below to get up and running:

### Prerequisites
- **Node.js**: v20 or higher installed from [https://nodejs.org/](https://nodejs.org/)

---

### Step 1: Install Dependencies & Setup
Double-click `install.cmd` or run in terminal:
```cmd
install.cmd
```
This script automatically:
1. Verifies your Node.js installation.
2. Enables Yarn package manager.
3. Preserves and uses the pre-configured `.env` file (included in the zip).
4. Installs all workspace packages (`yarn install`).
5. Generates database Prisma client (`yarn db:generate`).

---

### Step 2: Start Development Servers
Double-click `dev.cmd` or run in terminal:
```cmd
dev.cmd
```
*(or run `yarn dev`)*

---

### Step 3: Open in Browser
Open your browser and navigate to:
**http://localhost:3000**
