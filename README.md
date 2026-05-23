# PharmaSignal 💊📊
> **AI-Powered Brand Intelligence Copilot for Pharma Commercial Teams**

PharmaSignal is a lightweight, high-fidelity competitive intelligence dashboard designed specifically for pharmaceutical brand managers and sales force effectiveness (SFE) leads. It aggregates, structures, and synthesizes real-time competitive signals from **ClinicalTrials.gov**, **PubMed literature**, and **Google News** into a polished, executive-ready intelligence brief in under 60 seconds.

**🔗 Live Demo:** *(Add your Render URL here e.g., https://pharmasignal.onrender.com)*

---

## 🎯 The Problem & Persona

### The Pain Point
Brand managers at top pharmaceutical companies spend **3 to 5 hours every week** manually gathering competitive signals before weekly brand reviews or campaign planning cycles. They manually scrape pipeline updates on ClinicalTrials.gov, scan Google News for competitor press releases, and search PubMed for scientific shifts. 

Generic AI tools (like ChatGPT or Perplexity) lack pharma commercial context—they don't understand the specific signals that matter to a brand manager vs. a medical affairs lead, and they don't format outputs to map to real pharmaceutical commercial workflows.

### Primary User Persona: Priya S. (Brand Manager)
* "Just tell me what changed in my competitive landscape this week, what it means for my brand, and what I should do about it — in one place." *

---

## ✨ Features

- **Real-Time Multi-Stream Fetching**: Queries live public databases in parallel:
  - **ClinicalTrials.gov API (v2)**: Tracks competitor pipeline trial phases, recruiting status, and updates.
  - **PubMed Central (E-Utilities)**: Pulls active scientific publications and journals.
  - **Google News RSS Engine**: Gathers real-time industry press releases and commercial headlines **without requiring paid third-party API keys**.
- **Double-Engine Synthesis**: 
  - **Live AI Mode**: Uses the Gemini API (`gemini-2.5-flash` or `gemini-2.5-pro`) to perform deep, strategically sharp competitive synthesis tailored to a brand manager's focus.
  - **Hybrid Demo Mode**: Runs instantly out-of-the-box without an API key! It takes the real-world trials, publications, and news fetched and weaves them into a structured, highly-authentic mock brief.
- **Executive-Ready Structured Brief Layout**:
  - **Executive Summary (TL;DR)**: Instantly visible Competitive Threat Levels and Critical Core Signals.
  - **Competitor Landscape Matrix**: A clean, scannable table mapping competitor clinical status to news signals.
  - **Scientific & Therapeutic Shifts**: Converts complex PubMed paper topics directly into field force rep detail aids.
  - **Strategic Brand Commands**: Highly actionable directives organized by department (**SFE**, **Marketing**, and **Medical Affairs**).
- **Premium Glassmorphic Workspace**: A stunning Single-Page Application (SPA) dashboard featuring out-of-the-box Dark Mode, toggleable Clinical Light Mode, active connection socket indicators, and a live progress logger.
- **Utility Integrations**:
  - **Saved Briefs History**: Caches past reviews in `localStorage` for instant sidebar reloading.
  - **One-Click Export**: Supports direct Copy-to-Clipboard and Download as a styled Markdown (`.md`) file.

---

## 🛠️ Technology Stack

Designed to be **zero-dependency, ultra-lightweight, and fully portable**:
- **Backend**: Pure Python 3.13 standard libraries (`http.server`, `urllib`, `xml.etree`). Requires absolutely no `pip install` packages, ensuring instant deployment on any corporate environment or free host.
- **Frontend**: Vanilla HTML5, premium custom CSS3 styling (glassmorphism overlays, custom transitions, CSS variables), and vanilla ES6+ Javascript.

---

## 🚀 Local Installation & Quick Start

Since the app has no external dependencies, setting it up locally takes 10 seconds:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/pharmasignal.git
   cd pharmasignal
   ```

2. **Run the local server**:
   ```bash
   python server.py
   ```

3. **Access the application**:
   Open your browser and navigate to `http://localhost:8080`.

---

## 📁 Project Structure

```
├── server.py         # Multi-threaded local Python server (static host & CORS proxy)
├── index.html        # Main dashboard interface
├── style.css         # Premium HSL styling, responsive layouts, and themes
├── app.js            # Frontend state engine, log animations, and markdown parser
└── README.md         # Professional project documentation
```
