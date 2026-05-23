import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import os
import sys
import threading
from datetime import datetime

PORT = 8080
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

class PharmaSignalRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Always serve files relative to the workspace directory
        super().__init__(*args, directory=WORKSPACE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS for convenience
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        if self.path == '/api/signals':
            self.handle_signals_request()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_signals_request(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            params = json.loads(post_data.decode('utf-8'))
        except Exception as e:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Invalid JSON: " + str(e)}).encode('utf-8'))
            return

        brand = params.get('brand', '').strip()
        therapy_area = params.get('therapyArea', '').strip()
        competitors = [c.strip() for c in params.get('competitors', []) if c.strip()]
        strategic_question = params.get('strategicQuestion', '').strip()
        api_key = params.get('apiKey', '').strip()
        model = params.get('model', 'gemini-2.5-flash').strip()

        if not brand:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Brand name is required"}).encode('utf-8'))
            return

        # Fetch signals in parallel (simulated here with standard procedural fetching to maintain compatibility,
        # but structured cleanly so it completes rapidly)
        results = {
            "trials": [],
            "pubmed": [],
            "news": [],
            "brief": "",
            "sources": []
        }

        # Setup User-Agent for headers
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }

        search_query = f"{brand} " + " ".join(competitors)

        # 1. ClinicalTrials.gov
        try:
            timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
            results["sources"].append({"name": "ClinicalTrials.gov", "timestamp": timestamp})
            
            # Format query term for API v2
            # API endpoint: https://clinicaltrials.gov/api/v2/studies
            query_term = f"{brand} OR " + " OR ".join(competitors) if competitors else brand
            ct_url = f"https://clinicaltrials.gov/api/v2/studies?query.term={urllib.parse.quote(query_term)}&pageSize=5"
            
            req = urllib.request.Request(ct_url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as response:
                ct_data = json.loads(response.read().decode('utf-8'))
                studies = ct_data.get('studies', [])
                for study in studies:
                    protocol = study.get('protocolSection', {})
                    ident = protocol.get('identificationModule', {})
                    status_mod = protocol.get('statusModule', {})
                    sponsor_mod = protocol.get('sponsorCollaboratorsModule', {})
                    desc_mod = protocol.get('descriptionModule', {})
                    
                    results["trials"].append({
                        "nctId": ident.get('nctId', 'N/A'),
                        "title": ident.get('officialTitle', ident.get('briefTitle', 'Untitled Study')),
                        "status": status_mod.get('overallStatus', 'UNKNOWN'),
                        "sponsor": sponsor_mod.get('leadSponsor', {}).get('name', 'Unknown Sponsor'),
                        "summary": desc_mod.get('briefSummary', 'No description available.')
                    })
        except Exception as e:
            print(f"Error fetching ClinicalTrials: {e}")
            # Fallback to empty list so app doesn't crash

        # 2. PubMed
        try:
            timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
            results["sources"].append({"name": "PubMed (NCBI E-Utilities)", "timestamp": timestamp})
            
            # Build medical literature search term
            pm_query = f"{therapy_area} AND ({brand}"
            for comp in competitors:
                pm_query += f" OR {comp}"
            pm_query += ")"
            
            # Search PubMed IDs
            search_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={urllib.parse.quote(pm_query)}&retmode=json&retmax=5"
            req = urllib.request.Request(search_url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as search_res:
                search_data = json.loads(search_res.read().decode('utf-8'))
                id_list = search_data.get('esearchresult', {}).get('idlist', [])
            
            if id_list:
                ids_str = ",".join(id_list)
                summary_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={ids_str}&retmode=json"
                req_sum = urllib.request.Request(summary_url, headers=headers)
                with urllib.request.urlopen(req_sum, timeout=8) as sum_res:
                    sum_data = json.loads(sum_res.read().decode('utf-8'))
                    results_uids = sum_data.get('result', {})
                    for uid in id_list:
                        paper_info = results_uids.get(uid, {})
                        if paper_info:
                            authors_list = paper_info.get('authors', [])
                            author_names = ", ".join([a.get('name', '') for a in authors_list[:3]])
                            if len(authors_list) > 3:
                                author_names += " et al."
                            results["pubmed"].append({
                                "pmid": uid,
                                "title": paper_info.get('title', 'No Title Available'),
                                "pubDate": paper_info.get('pubdate', 'N/A'),
                                "journal": paper_info.get('source', 'Unknown Journal'),
                                "authors": author_names
                            })
        except Exception as e:
            print(f"Error fetching PubMed: {e}")

        # 3. Google News RSS (CORS proxy for News)
        try:
            timestamp = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')
            results["sources"].append({"name": "Google News RSS", "timestamp": timestamp})
            
            news_query = f"{brand} OR " + " OR ".join(competitors) if competitors else brand
            news_url = f"https://news.google.com/rss/search?q={urllib.parse.quote(news_query)}&hl=en-US&gl=US&ceid=US:en"
            
            req = urllib.request.Request(news_url, headers=headers)
            with urllib.request.urlopen(req, timeout=8) as response:
                xml_data = response.read()
                root = ET.fromstring(xml_data)
                
                count = 0
                for item in root.findall('.//item'):
                    if count >= 6: # limit to top 6 news items
                        break
                    title = item.find('title').text if item.find('title') is not None else 'No Title'
                    link = item.find('link').text if item.find('link') is not None else '#'
                    pub_date = item.find('pubDate').text if item.find('pubDate') is not None else 'N/A'
                    source_elm = item.find('source')
                    source = source_elm.text if source_elm is not None else 'Unknown'
                    
                    results["news"].append({
                        "title": title,
                        "link": link,
                        "pubDate": pub_date,
                        "source": source
                    })
                    count += 1
        except Exception as e:
            print(f"Error fetching News: {e}")

        # 4. LLM Synthesis or High-Fidelity Mock
        if api_key:
            try:
                brief = self.synthesize_with_gemini(brand, therapy_area, competitors, strategic_question, results, api_key, model)
                results["brief"] = brief
            except Exception as e:
                print(f"Error compiling with Gemini API: {e}")
                results["brief"] = f"### [Warning] LLM Generation Failed\nAn error occurred while connecting to the Gemini API: `{str(e)}`.\n\nFalling back to high-fidelity static intelligence brief compile:\n\n" + self.generate_mock_brief(brand, therapy_area, competitors, strategic_question, results)
        else:
            results["brief"] = self.generate_mock_brief(brand, therapy_area, competitors, strategic_question, results)

        # Return results
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(results).encode('utf-8'))

    def synthesize_with_gemini(self, brand, therapy_area, competitors, strategic_question, data, api_key, model):
        # Prepare content context for prompt
        trials_ctx = ""
        for i, t in enumerate(data["trials"]):
            trials_ctx += f"[{i+1}] NCT ID: {t['nctId']} | Sponsor: {t['sponsor']} | Status: {t['status']}\n    Title: {t['title']}\n    Summary: {t['summary'][:300]}...\n\n"
        
        pubmed_ctx = ""
        for i, p in enumerate(data["pubmed"]):
            pubmed_ctx += f"[{i+1}] PMID: {p.get('pmid', 'N/A')} | Journal: {p['journal']} | Date: {p['pubDate']} | Authors: {p['authors']}\n    Title: {p['title']}\n\n"
            
        news_ctx = ""
        for i, n in enumerate(data["news"]):
            news_ctx += f"[{i+1}] Publisher: {n['source']} | Date: {n['pubDate']}\n    Title: {n['title']}\n\n"

        prompt = f"""
You are PharmaSignal, an expert Brand Intelligence Copilot specializing in pharmaceutical commercial strategy, sales force effectiveness (SFE), and competitor tracking. 
Your target user is a Top-5 Pharma Brand Manager. The language should be analytical, strategically actionable, and commercially sharp.

Synthesize the following real-time signals into a comprehensive, highly-structured brand review brief.

BRAND PROFILE:
- Brand Name: {brand}
- Therapy Area: {therapy_area}
- Competitors: {', '.join(competitors) if competitors else 'None entered'}
- Brand Manager Strategic Question: {strategic_question if strategic_question else 'Analyze general competitive posture and recent shifts.'}

RAW CLINICAL TRIALS SIGNAL CONTEXT:
{trials_ctx if trials_ctx else 'No clinical trials found matching the brand/competitor query.'}

RAW PUBMED LITERATURE CONTEXT:
{pubmed_ctx if pubmed_ctx else 'No recent clinical publications found matching the therapy/brand profile.'}

RAW COMPETITOR NEWS CONTEXT:
{news_ctx if news_ctx else 'No recent industry news articles found matching the brand/competitor profile.'}

INSTRUCTIONS FOR GENERATION:
Assemble the output EXACTLY in the following format. Use markdown tables, clean short lists, and clear bold headings. Highlight critical takeaways to make it exceptionally easy for a brand manager to read in 30 seconds.

════════════════════════════════════════
PHARMASIGNAL CO-PILOT BRIEF
Brand: {brand} | Therapy Area: {therapy_area}
Competitors: {', '.join(competitors) if competitors else 'None'}
Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}
════════════════════════════════════════

### 1. EXECUTIVE INTEL SUMMARY (TL;DR)
*A high-level synthesis for quick executive review.*
- **COMPETITIVE THREAT LEVEL**: [HIGH / MEDIUM / LOW] (Determine based on the consolidation of competitor clinical and news activity)
- **CRITICAL CORE SIGNAL**: A single, impactful sentence highlighting the single most significant shift identified across all datasets this week.
- **IMMEDIATE STRATEGIC FOCUS**: A concise description of the most critical competitive window or scientific update that the brand team must address.

### 2. THE COMPETITOR LANDSCAPE MATRIX
*Scannable analysis of pipeline changes and commercial press movements. Use a markdown table.*

| Molecule / Competitor | Clinical Pipeline Update (ClinicalTrials.gov) | Market / Commercial Signal (News) | Commercial Impact Assessment |
|:---|:---|:---|:---|
| **{brand}** | [Summarize latest brand trial updates found or state 'No new updates'] | [Summarize latest brand news found or state 'Stable press presence'] | *Baseline positioning target* |
| **[Competitor 1]** | [Clinical pipeline signal for Competitor 1] | [Commercial signal for Competitor 1] | [Impact level & 1-sentence strategic threat description] |
| **[Competitor 2 (if present)]** | [Clinical pipeline signal for Competitor 2] | [Commercial signal for Competitor 2] | [Impact level & 1-sentence strategic threat description] |

### 3. THERAPEUTIC & SCIENTIFIC SHIFTS
*Important clinical developments in active publications and scientific consensus (PubMed).*
- **Trend Highlight**: A key topic being heavily discussed in recent literature (e.g. pediatric indications, safety trials, dosing adjustments).
- **Detailing Translation**: How to translate this scientific signal into field force detail aids:
  - *Detailing Argument 1*: [Rep talking point]
  - *Detailing Argument 2*: [Rep talking point]
- **KOL Alignment Alert**: Key endpoints or outcomes that medical affairs leads should highlight in peer briefings.

### 4. STRATEGIC BRAND COMMANDS
*Actionable directives organized by functional department to map directly into brand reviews.*

#### A. SALES FORCE EFFECTIVENESS (SFE) & FIELD EXECUTION
- **Action Directive**: [Immediate territory action, rep pitch tweak, or clinical objection handler]

#### B. BRANDING & MULTICHANNEL MARKETING
- **Action Directive**: [Digital marketing adjustment, repositioning message, or detail aid rollout]

#### C. MEDICAL AFFAIRS & KOL ENGAGEMENT
- **Action Directive**: [KOL briefing packets, MSL training directives, or registry data collection]

Sources:
- ClinicalTrials.gov (Active Endpoint Query, {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')})
- PubMed NCBI E-Utilities (Active API Query, {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')})
- Google News RSS Scraper (Active API Query, {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')})
════════════════════════════════════════
"""

        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ]
        }
        
        req = urllib.request.Request(
            gemini_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req, timeout=12) as response:
            res_json = json.loads(response.read().decode('utf-8'))
            candidates = res_json.get('candidates', [])
            if candidates:
                parts = candidates[0].get('content', {}).get('parts', [])
                if parts:
                    return parts[0].get('text', 'No synthesis generated.')
            raise ValueError(f"Unexpected response format from Gemini: {res_json}")

    def generate_mock_brief(self, brand, therapy_area, competitors, strategic_question, data):
        # Create a beautiful, authentic mock brief if no API key is present
        # This will use the ACTUAL data fetched dynamically to customize the mock, making it a "high-fidelity hybrid mock"
        date_str = datetime.utcnow().strftime('%B %d, %Y, %H:%M UTC')
        comp_str = ", ".join(competitors) if competitors else "None"
        comp_list = competitors if competitors else ["Substitute Therapies"]
        
        # Consolidate clinical trials into a single summary line for the matrix
        brand_trials_sum = "No active clinical trial updates registered in ClinicalTrials.gov this cycle."
        comp_trials_sum = "Active Phase III pipeline expansion registered."
        
        if data["trials"]:
            brand_trials = [t for t in data["trials"] if brand.lower() in t["title"].lower() or brand.lower() in t["summary"].lower()]
            comp_trials = [t for t in data["trials"] if any(c.lower() in t["title"].lower() or c.lower() in t["sponsor"].lower() for c in comp_list)]
            
            if brand_trials:
                brand_trials_sum = f"Active trial {brand_trials[0]['nctId']} ({brand_trials[0]['status']}) showing progress."
            if comp_trials:
                comp_trials_sum = f"Clinical candidate trial {comp_trials[0]['nctId']} ({comp_trials[0]['status']}) actively recruiting."
            else:
                comp_trials_sum = f"Trial {data['trials'][0]['nctId']} ({data['trials'][0]['status']}) sponsored by {data['trials'][0]['sponsor']} under active review."

        # Consolidate news into single summary line
        brand_news_sum = "Stable press and publication tracking."
        comp_news_sum = "Moderate commercial mentions on product differentiation."
        if data["news"]:
            brand_news = [n for n in data["news"] if brand.lower() in n["title"].lower()]
            comp_news = [n for n in data["news"] if any(c.lower() in n["title"].lower() for c in comp_list)]
            if brand_news:
                brand_news_sum = f"Headline: \"{brand_news[0]['title'][:50]}...\" ({brand_news[0]['source']})"
            if comp_news:
                comp_news_sum = f"Headline: \"{comp_news[0]['title'][:50]}...\" ({comp_news[0]['source']})"
            else:
                comp_news_sum = f"Industry chat: \"{data['news'][0]['title'][:50]}...\" ({data['news'][0]['source']})"

        # Scientific journal shift bullets
        lit_highlight = f"Active debates in the {therapy_area} space focus on patient selection criteria and long-term durability indices."
        lit_details = [
            "Emphasize durability and safety profiles in detailing aids to counter active competitor scientific releases.",
            "Utilize localized epidemiologic carriage data to demonstrate the clinical value of early intervention to physicians."
        ]
        if data["pubmed"]:
            lit_highlight = f"Clinical shift (PMID: {data['pubmed'][0]['pmid']}) published in {data['pubmed'][0]['journal']} highlights growing discussions around: \"{data['pubmed'][0]['title'][:60]}...\""
            if len(data["pubmed"]) > 1:
                lit_details[0] = f"Address clinical endpoints around: \"{data['pubmed'][0]['title'][:50]}...\" to reassure prescribers."
                lit_details[1] = f"Tether the {brand} detail narrative to therapeutic priorities listed in *{data['pubmed'][1]['journal']}*."

        # Competitor threat level assessment
        threat_level = "MEDIUM"
        threat_desc = "Standard competitive presence. Monitor SFE sizing closely."
        if len(competitors) > 1:
            threat_level = "HIGH"
            threat_desc = "Aggressive multi-competitor trial recruitment and high-volume media chatter. Defend core territories."
        
        # Build the final hybrid template
        mock_template = f"""════════════════════════════════════════
PHARMASIGNAL CO-PILOT BRIEF (DEMO MODE / HYBRID SYNTHESIS)
Brand: {brand} | Therapy Area: {therapy_area}
Competitors: {comp_str} | Generated: {date_str}
════════════════════════════════════════

### 1. EXECUTIVE INTEL SUMMARY (TL;DR)
*A high-level synthesis for quick executive review.*
- **COMPETITIVE THREAT LEVEL**: **{threat_level}** - {threat_desc}
- **CRITICAL CORE SIGNAL**: Competitors are actively executing multi-center Phase III expansion trials in {therapy_area} while driving robust digital medical PR.
- **IMMEDIATE STRATEGIC FOCUS**: Protect key sales territories from competitor rep expansion by updating our field force's scientific detailing narrative.

### 2. THE COMPETITOR LANDSCAPE MATRIX
*Scannable analysis of pipeline changes and commercial press movements.*

| Molecule / Competitor | Clinical Pipeline Update (ClinicalTrials.gov) | Market / Commercial Signal (News) | Commercial Impact Assessment |
|:---|:---|:---|:---|
| **{brand}** | {brand_trials_sum} | {brand_news_sum} | *Baseline positioning target* |
| **{comp_list[0]}** | {comp_trials_sum} | {comp_news_sum} | **MODERATE DIRECT THREAT**: Triage detailing narratives. |
| **{comp_list[1] if len(comp_list) > 1 else 'General Category'}** | Phase II/III trial maintenance tracking active. | Competitor PR focuses on combination therapy indications. | **MONITOR SIGNAL**: High safety priority. |

### 3. THERAPEUTIC & SCIENTIFIC SHIFTS
*Important clinical developments in active publications and scientific consensus (PubMed).*
- **Trend Highlight**: {lit_highlight}
- **Detailing Translation**: How to translate this scientific signal into field force detail aids:
  - *Detailing Argument 1*: {lit_details[0]}
  - *Detailing Argument 2*: {lit_details[1]}
- **KOL Alignment Alert**: Highlight safety endpoints and durable outcomes to counter the academic claims from competitor MSL cohorts.

### 4. STRATEGIC BRAND COMMANDS
*Actionable directives organized by functional department to map directly into brand reviews.*

#### A. SALES FORCE EFFECTIVENESS (SFE) & FIELD EXECUTION
- **Action Directive**: Train reps to emphasize {brand}'s long-term safety data in response to competitor pipeline discussions. Redirect field visits toward high-volume prescribers in tier-1 centers.

#### B. BRANDING & MULTICHANNEL MARKETING
- **Action Directive**: Launch a targeted digital campaign highlighting {brand}'s real-world evidence (RWE) outcomes. Prepare a visual 1-pager contrast sheet for the sales force detail aid.

#### C. MEDICAL AFFAIRS & KOL ENGAGEMENT
- **Action Directive**: Task MSLs with executing advisory boards focused on long-term clinical safety profiles. Initiate localized registry databases to consolidate {brand}'s clinical durability.

Sources:
- ClinicalTrials.gov (Active Endpoint Query, {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')})
- PubMed NCBI E-Utilities (Active API Query, {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')})
- Google News RSS Scraper (Active API Query, {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')})
════════════════════════════════════════
"""
        return mock_template

if __name__ == '__main__':
    # Print welcome block
    print("=" * 60)
    print("           PHARMASIGNAL LOCAL BACKEND SERVER")
    print("=" * 60)
    print(f"Server is initializing in: {WORKSPACE_DIR}")
    print(f"Listening on: http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    print("=" * 60)
    
    server_address = ('', PORT)
    httpd = ThreadingHTTPServer(server_address, PharmaSignalRequestHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()
        sys.exit(0)
