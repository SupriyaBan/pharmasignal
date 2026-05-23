// PharmaSignal Frontend State Controller
let competitors = [];
let savedBriefs = [];
let currentBriefData = null;

// DOM Elements
const brandNameInput = document.getElementById('brand-name');
const therapyAreaSelect = document.getElementById('therapy-area');
const competitorInput = document.getElementById('competitor-input');
const addCompetitorBtn = document.getElementById('add-competitor-btn');
const competitorTagsList = document.getElementById('competitor-tags-list');
const strategicQuestionText = document.getElementById('strategic-question');
const signalsForm = document.getElementById('signals-form');
const generateBtn = document.getElementById('generate-btn');

// Sidebar config
const geminiKeyInput = document.getElementById('gemini-key');
const geminiModelSelect = document.getElementById('gemini-model');
const historyContainer = document.getElementById('history-container');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIconMoon = document.getElementById('theme-icon-moon');
const themeIconSun = document.getElementById('theme-icon-sun');

// Logging & Output
const consoleLogger = document.getElementById('console-logger');
const loggerRowsContainer = document.getElementById('logger-rows-container');
const loggerStatusText = document.getElementById('logger-status-text');
const resultsSection = document.getElementById('results-section');

// Output targets
const briefContentTarget = document.getElementById('brief-content-target');
const trialsContentTarget = document.getElementById('trials-content-target');
const litContentTarget = document.getElementById('lit-content-target');
const newsContentTarget = document.getElementById('news-content-target');
const rawContentTarget = document.getElementById('raw-content-target');

// Actions
const copyBriefBtn = document.getElementById('copy-brief-btn');
const downloadBriefBtn = document.getElementById('download-brief-btn');

// Setup theme, local storage loading
document.addEventListener('DOMContentLoaded', () => {
    // Load config from localStorage
    if (localStorage.getItem('geminiApiKey')) {
        geminiKeyInput.value = localStorage.getItem('geminiApiKey');
    }
    if (localStorage.getItem('geminiModel')) {
        geminiModelSelect.value = localStorage.getItem('geminiModel');
    }
    
    // Theme Management
    const activeTheme = localStorage.getItem('pharmaTheme') || 'dark';
    document.documentElement.setAttribute('data-theme', activeTheme);
    updateThemeIcon(activeTheme);

    // Load History
    loadHistory();

    // Setup active listeners
    bindEvents();
});

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        themeIconMoon.style.display = 'block';
        themeIconSun.style.display = 'none';
    } else {
        themeIconMoon.style.display = 'none';
        themeIconSun.style.display = 'block';
    }
}

function bindEvents() {
    // Theme toggle
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('pharmaTheme', nextTheme);
        updateThemeIcon(nextTheme);
    });

    // Clear history cache
    clearCacheBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear your saved briefs? This cannot be undone.")) {
            savedBriefs = [];
            localStorage.removeItem('pharmaBriefs');
            loadHistory();
        }
    });

    // Save key/model selections on change
    geminiKeyInput.addEventListener('change', () => {
        localStorage.setItem('geminiApiKey', geminiKeyInput.value.trim());
    });
    geminiModelSelect.addEventListener('change', () => {
        localStorage.setItem('geminiModel', geminiModelSelect.value);
    });

    // Competitor management
    competitorInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addCompetitor();
        }
    });
    addCompetitorBtn.addEventListener('click', addCompetitor);

    // Form submit pipeline
    signalsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        triggerIntelSynthesis();
    });

    // Tab view switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const panels = document.querySelectorAll('.tab-panel');
            panels.forEach(p => p.classList.remove('active'));
            
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    // Action Triggers
    copyBriefBtn.addEventListener('click', copyBriefToClipboard);
    downloadBriefBtn.addEventListener('click', downloadBriefAsMarkdown);
}

// Competitor Tags Management
function addCompetitor() {
    const compVal = competitorInput.value.trim();
    if (!compVal) return;
    
    if (competitors.length >= 3) {
        alert("You can track up to 3 competitors for your MVP review.");
        return;
    }
    
    if (competitors.includes(compVal)) {
        alert("This competitor has already been added.");
        return;
    }
    
    competitors.push(compVal);
    competitorInput.value = '';
    renderCompetitorTags();
}

function removeCompetitor(comp) {
    competitors = competitors.filter(c => c !== comp);
    renderCompetitorTags();
}

function renderCompetitorTags() {
    competitorTagsList.innerHTML = '';
    competitors.forEach(comp => {
        const tag = document.createElement('div');
        tag.className = 'competitor-tag';
        tag.innerHTML = `
            <span>${comp}</span>
            <button type="button" aria-label="Remove ${comp}">&times;</button>
        `;
        tag.querySelector('button').addEventListener('click', () => removeCompetitor(comp));
        competitorTagsList.appendChild(tag);
    });
}

// Logging Display
function addLogLine(text, isSpin = false) {
    const row = document.createElement('div');
    row.className = 'logger-row';
    
    const timestamp = document.createElement('span');
    timestamp.className = 'logger-timestamp';
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    timestamp.textContent = `[${timeStr}]`;
    
    const content = document.createElement('span');
    if (isSpin) {
        const spinner = document.createElement('span');
        spinner.className = 'logger-spinner';
        content.appendChild(spinner);
        
        const space = document.createTextNode(' ' + text);
        content.appendChild(space);
    } else {
        content.textContent = text;
    }
    
    row.appendChild(timestamp);
    row.appendChild(content);
    loggerRowsContainer.appendChild(row);
    consoleLogger.scrollTop = consoleLogger.scrollHeight;
    
    return row;
}

// Run Asynchronous Signal Fetch & Synthesis
async function triggerIntelSynthesis() {
    const brand = brandNameInput.value.trim();
    const therapy = therapyAreaSelect.value;
    const strategic = strategicQuestionText.value.trim();
    const key = geminiKeyInput.value.trim();
    const model = geminiModelSelect.value;
    
    if (!brand) return;

    // Reset view states
    generateBtn.disabled = true;
    consoleLogger.style.display = 'flex';
    loggerRowsContainer.innerHTML = '';
    resultsSection.style.display = 'none';
    
    // Animate connection icons initially
    document.getElementById('ct-indicator').className = 'status-indicator pulse';
    document.getElementById('pm-indicator').className = 'status-indicator pulse';
    document.getElementById('news-indicator').className = 'status-indicator pulse';

    addLogLine("PharmaSignal brand pipeline initialized...", false);
    
    // Simulate real logs while executing server requests
    const fetchLog = addLogLine(`Connecting to databases for target: ${brand}...`, true);
    
    try {
        // Prepare request parameters
        const requestPayload = {
            brand: brand,
            therapyArea: therapy,
            competitors: competitors,
            strategicQuestion: strategic,
            apiKey: key,
            model: model
        };
        
        const response = await fetch('/api/signals', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestPayload)
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Server HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        currentBriefData = data;
        
        // Success animation logs
        fetchLog.innerHTML = `<span class="logger-timestamp">[${new Date().toTimeString().split(' ')[0]}]</span> <span style="color: var(--accent-emerald);">✔ Database connection active. Signals fetched successfully.</span>`;
        
        addLogLine(`ClinicalTrials.gov retrieved: ${data.trials.length} matches.`, false);
        addLogLine(`PubMed citations matched: ${data.pubmed.length} research abstracts.`, false);
        addLogLine(`Google News processed: ${data.news.length} competitor headlines.`, false);
        
        const synthesisLog = addLogLine("Initiating Brand Review synthesis using Gemini LLM...", true);
        
        // Wait 1 second to let logs breathe (premium feedback animation)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        synthesisLog.innerHTML = `<span class="logger-timestamp">[${new Date().toTimeString().split(' ')[0]}]</span> <span style="color: var(--accent-emerald);">✔ Intelligence Brief synthesised successfully.</span>`;
        
        addLogLine("Writing and formatting workspace results...", false);
        
        // Load and render components
        renderBrief(data.brief);
        renderTrialsBoard(data.trials);
        renderLiteratureCitations(data.pubmed);
        renderNewsGrid(data.news);
        renderRawData(data);
        
        // Save to History Cache
        saveBriefToHistory(brand, therapy, data);

        // Turn status lights solid
        document.getElementById('ct-indicator').className = 'status-indicator';
        document.getElementById('pm-indicator').className = 'status-indicator';
        document.getElementById('news-indicator').className = 'status-indicator';
        
        loggerStatusText.textContent = "COMPILATION COMPLETE";
        loggerStatusText.style.color = "var(--accent-emerald)";
        
        // Activate output
        resultsSection.style.display = 'flex';
        document.querySelector('.tab-btn[data-target="brief-panel"]').click(); // Auto click Brief tab
        
        // Scroll smoothly to output
        resultsSection.scrollIntoView({ behavior: 'smooth' });
        
    } catch (err) {
        console.error(err);
        fetchLog.innerHTML = `<span class="logger-timestamp">[${new Date().toTimeString().split(' ')[0]}]</span> <span style="color: var(--accent-rose);">✘ Signal procurement failed. Reason: ${err.message}</span>`;
        
        document.getElementById('ct-indicator').className = 'status-indicator error';
        document.getElementById('pm-indicator').className = 'status-indicator error';
        document.getElementById('news-indicator').className = 'status-indicator error';
        
        loggerStatusText.textContent = "FAILED";
        loggerStatusText.style.color = "var(--accent-rose)";
    } finally {
        generateBtn.disabled = false;
    }
}

// Markdown-to-HTML parser for the Brief tab
function renderBrief(markdownText) {
    if (!markdownText) {
        briefContentTarget.innerHTML = "<p>No brief was generated.</p>";
        return;
    }
    
    const lines = markdownText.split('\n');
    let htmlOutput = '';
    let inList = false;
    let inHeaderBox = false;
    let inTable = false;
    
    for (let line of lines) {
        const trimmed = line.trim();
        
        // Detect and handle Brief border tags
        if (trimmed.startsWith('════════') || trimmed.startsWith('--------') || trimmed.startsWith('========')) {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
            if (inTable) { htmlOutput += '</table></div>'; inTable = false; }
            if (inHeaderBox) {
                htmlOutput += '</div>';
                inHeaderBox = false;
            } else if (htmlOutput === '') {
                htmlOutput += '<div class="brief-header-box">';
                inHeaderBox = true;
            } else {
                htmlOutput += '<hr style="border: 0; border-top: 1px dashed var(--border-color); margin: 1.5rem 0;">';
            }
            continue;
        }
        
        if (inHeaderBox) {
            htmlOutput += `${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}<br>`;
            continue;
        }
        
        // Handle Tables (lines starting with '|')
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
            if (trimmed.includes('---')) {
                // Skip separator rows in markdown
                continue;
            }
            
            let cells = trimmed.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            
            if (!inTable) {
                htmlOutput += '<div style="overflow-x: auto; margin: 1.5rem 0; border-radius: 8px; border: 1px solid var(--border-color);"><table style="width: 100%; border-collapse: collapse; font-size: 0.85rem; background: rgba(255, 255, 255, 0.01);">';
                inTable = true;
                
                // Render table header
                htmlOutput += '<tr style="background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid var(--border-color);">';
                cells.forEach(cell => {
                    let cellContent = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
                    htmlOutput += `<th style="padding: 0.75rem 1rem; text-align: left; font-weight: 700; color: var(--text-active); border-right: 1px solid var(--border-color);">${cellContent}</th>`;
                });
                htmlOutput += '</tr>';
            } else {
                // Render table body row
                htmlOutput += '<tr style="border-bottom: 1px solid var(--border-color);">';
                cells.forEach(cell => {
                    let cellContent = cell.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
                    htmlOutput += `<td style="padding: 0.75rem 1rem; color: var(--text-main); border-right: 1px solid var(--border-color);">${cellContent}</td>`;
                });
                htmlOutput += '</tr>';
            }
            continue;
        } else {
            if (inTable) {
                htmlOutput += '</table></div>';
                inTable = false;
            }
        }
        
        // Match H4 subheaders
        if (trimmed.startsWith('####')) {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
            const headerText = trimmed.replace('####', '').trim();
            htmlOutput += `<h4 style="font-size: 1rem; font-weight: 700; color: var(--accent-indigo-light); margin-top: 1.5rem; margin-bottom: 0.5rem;">${headerText}</h4>`;
            continue;
        }
        
        // Match H3 headers
        if (trimmed.startsWith('###')) {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
            const headerText = trimmed.replace('###', '').trim();
            htmlOutput += `<h3 style="font-size: 1.2rem; font-weight: 700; color: var(--accent-emerald); margin-top: 1.75rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">${headerText}</h3>`;
            continue;
        } 
        
        // Match lists
        if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
            if (!inList) { htmlOutput += '<ul style="margin-left: 1.5rem; margin-bottom: 1.5rem; list-style-type: square; color: var(--text-muted);">'; inList = true; }
            let itemContent = trimmed.substring(1).trim();
            itemContent = itemContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            itemContent = itemContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
            htmlOutput += `<li style="margin-bottom: 0.5rem; color: var(--text-main);">${itemContent}</li>`;
        } 
        // Match numbered priority lists
        else if (trimmed.match(/^\d+\./)) {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
            let itemContent = trimmed.replace(/^\d+\./, '').trim();
            itemContent = itemContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            itemContent = itemContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
            htmlOutput += `<p style="margin-bottom: 0.75rem; padding-left: 0.5rem;"><strong>${trimmed.match(/^\d+\./)[0]}</strong> ${itemContent}</p>`;
        } 
        // Standard paragraphs
        else if (trimmed.length > 0) {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
            let processedLine = trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            processedLine = processedLine.replace(/\*(.*?)\*/g, '<em>$1</em>');
            htmlOutput += `<p style="margin-bottom: 0.75rem; color: var(--text-muted);">${processedLine}</p>`;
        } 
        // Blank line gaps
        else {
            if (inList) { htmlOutput += '</ul>'; inList = false; }
        }
    }
    
    if (inList) htmlOutput += '</ul>';
    if (inTable) htmlOutput += '</table></div>';
    if (inHeaderBox) htmlOutput += '</div>';
    
    briefContentTarget.innerHTML = htmlOutput;
}

// Render Trial timelines
function renderTrialsBoard(trials) {
    trialsContentTarget.innerHTML = '';
    if (!trials || trials.length === 0) {
        trialsContentTarget.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <p>No competitor clinical trials retrieved.</p>
            </div>
        `;
        return;
    }
    
    trials.forEach(trial => {
        const card = document.createElement('div');
        card.className = 'trial-card';
        
        // Clean status text class
        let statusClass = 'status-unknown';
        const rawStatus = trial.status.toUpperCase();
        if (rawStatus.includes('RECRUITING') || rawStatus.includes('ACTIVE')) statusClass = 'status-recruiting';
        else if (rawStatus.includes('COMPLETED') || rawStatus.includes('TERMINATED')) statusClass = 'status-completed';
        
        card.innerHTML = `
            <div class="trial-header">
                <a href="https://clinicaltrials.gov/study/${trial.nctId}" target="_blank" class="trial-nct">${trial.nctId}</a>
                <span class="trial-status-badge ${statusClass}">${trial.status}</span>
            </div>
            <h4 class="trial-title">${trial.title}</h4>
            <div class="trial-meta">Sponsor: <span>${trial.sponsor}</span></div>
            <p class="trial-summary">${trial.summary}</p>
        `;
        trialsContentTarget.appendChild(card);
    });
}

// Render PubMed Citations
function renderLiteratureCitations(papers) {
    litContentTarget.innerHTML = '';
    if (!papers || papers.length === 0) {
        litContentTarget.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <p>No therapeutic medical literature matched.</p>
            </div>
        `;
        return;
    }
    
    papers.forEach(paper => {
        const card = document.createElement('div');
        card.className = 'lit-card';
        card.innerHTML = `
            <div class="lit-journal">${paper.journal} — ${paper.pubDate}</div>
            <h4 class="lit-title">${paper.title}</h4>
            <div class="lit-authors">Authors: ${paper.authors}</div>
            <div class="lit-meta-row">
                <span>Database: PubMed Central</span>
                <a href="https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}" target="_blank" class="pmid-link">PMID: ${paper.pmid} ↗</a>
            </div>
        `;
        litContentTarget.appendChild(card);
    });
}

// Render Google News Grid
function renderNewsGrid(articles) {
    newsContentTarget.innerHTML = '';
    if (!articles || articles.length === 0) {
        newsContentTarget.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-muted); grid-column: span 2;">
                <p>No recent competitive industry news found.</p>
            </div>
        `;
        return;
    }
    
    articles.forEach(article => {
        const card = document.createElement('div');
        card.className = 'news-card';
        card.innerHTML = `
            <div class="news-source-badge">${article.source}</div>
            <a href="${article.link}" target="_blank" class="news-title">${article.title}</a>
            <div class="news-footer">
                <span>Published: ${article.pubDate}</span>
                <a href="${article.link}" target="_blank" class="news-link">Read Article ↗</a>
            </div>
        `;
        newsContentTarget.appendChild(card);
    });
}

// Render raw JSON context
function renderRawData(data) {
    rawContentTarget.textContent = JSON.stringify(data, null, 4);
}

// Save & Retrieve history briefs using LocalStorage
function saveBriefToHistory(brand, therapy, data) {
    const briefObj = {
        id: Date.now(),
        brand: brand,
        therapyArea: therapy,
        competitors: competitors.slice(),
        timestamp: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        data: data
    };
    
    savedBriefs.unshift(briefObj);
    localStorage.setItem('pharmaBriefs', JSON.stringify(savedBriefs));
    loadHistory();
}

function loadHistory() {
    historyContainer.innerHTML = '';
    const stored = localStorage.getItem('pharmaBriefs');
    if (stored) {
        savedBriefs = JSON.parse(stored);
    }
    
    if (savedBriefs.length === 0) {
        historyContainer.innerHTML = '<div class="no-history">No history saved yet. Run a search to save a brief.</div>';
        return;
    }
    
    savedBriefs.forEach(brief => {
        const item = document.createElement('button');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-item-title">${brief.brand} (${brief.therapyArea})</div>
            <div class="history-item-meta">
                <span>Comps: ${brief.competitors.length > 0 ? brief.competitors.join(', ') : 'None'}</span>
                <span>${brief.timestamp}</span>
            </div>
        `;
        item.addEventListener('click', () => {
            currentBriefData = brief.data;
            competitors = brief.competitors.slice();
            renderCompetitorTags();
            
            // Hydrate inputs
            brandNameInput.value = brief.brand;
            therapyAreaSelect.value = brief.therapyArea;
            strategicQuestionText.value = brief.data.strategicQuestion || '';
            
            // Hydrate views
            renderBrief(brief.data.brief);
            renderTrialsBoard(brief.data.trials);
            renderLiteratureCitations(brief.data.pubmed);
            renderNewsGrid(brief.data.news);
            renderRawData(brief.data);
            
            // Expand and click brief
            resultsSection.style.display = 'flex';
            document.querySelector('.tab-btn[data-target="brief-panel"]').click();
            resultsSection.scrollIntoView({ behavior: 'smooth' });
        });
        historyContainer.appendChild(item);
    });
}

// Action Trigger Methods
function copyBriefToClipboard() {
    if (!currentBriefData || !currentBriefData.brief) return;
    
    navigator.clipboard.writeText(currentBriefData.brief).then(() => {
        alert("Brief text copied to clipboard!");
    }).catch(err => {
        alert("Failed to copy brief: " + err);
    });
}

function downloadBriefAsMarkdown() {
    if (!currentBriefData || !currentBriefData.brief) return;
    
    const element = document.createElement('a');
    const file = new Blob([currentBriefData.brief], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    
    const filename = `PharmaSignal_Brief_${currentBriefData.brief.match(/Brand:\s*(.*?)\s*\|/)?.[1]?.trim() || 'Brand'}_${Date.now()}.md`;
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}
