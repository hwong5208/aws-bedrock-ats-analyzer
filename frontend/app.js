// User requested API URL exactly matching their gateway
const API_URL = "https://mvxdrl0575.execute-api.us-west-2.amazonaws.com/analyze";

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const form = document.getElementById('analyzerForm');
    const jobDescriptionInput = document.getElementById('jobDescription');
    const resumeFileInput = document.getElementById('resumeFile');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const dropZone = document.getElementById('dropZone');

    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');

    const errorState = document.getElementById('errorState');
    const errorText = document.getElementById('errorText');
    const resultsSection = document.getElementById('resultsSection');

    // Results DOM
    const scoreValue = document.getElementById('scoreValue');
    const scoreProgress = document.getElementById('scoreProgress');
    const scoreLabel = document.getElementById('scoreLabel');
    const scoreBgGlow = document.getElementById('scoreBgGlow');
    const matchingKeywordsBox = document.getElementById('matchingKeywords');
    const missingKeywordsBox = document.getElementById('missingKeywords');
    const feedbackText = document.getElementById('feedbackText');

    // --- File Selection and Drag'n'Drop UI --- //

    function updateFileDisplay(fileName) {
        if (fileName) {
            fileNameDisplay.textContent = `Selected Document: ${fileName}`;
            fileNameDisplay.classList.add('text-purple-300');
            fileNameDisplay.classList.remove('text-slate-500');
            dropZone.classList.add('border-purple-500', 'bg-purple-900/10');
            dropZone.classList.remove('border-slate-700/60', 'bg-slate-900/50');
        } else {
            fileNameDisplay.textContent = 'Maximum file size: 10MB';
            fileNameDisplay.classList.add('text-slate-500');
            fileNameDisplay.classList.remove('text-purple-300');
            dropZone.classList.remove('border-purple-500', 'bg-purple-900/10');
            dropZone.classList.add('border-slate-700/60', 'bg-slate-900/50');
        }
    }

    resumeFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            updateFileDisplay(e.target.files[0].name);
        } else {
            updateFileDisplay(null);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-purple-400', 'bg-slate-800/80');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-purple-400', 'bg-slate-800/80');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-purple-400', 'bg-slate-800/80');

        if (e.dataTransfer.files.length) {
            const file = e.dataTransfer.files[0];
            if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
                resumeFileInput.files = e.dataTransfer.files;
                updateFileDisplay(file.name);
            } else {
                showError("Please drop a valid .pdf file.");
            }
        }
    });

    // --- PDF parsing via Client-Side pdf.js --- //

    async function extractPdfText(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            // loadDocument using pdf.js
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                // Join items to reconstruct text
                const pageText = textContent.items.map(item => item.str).join(" ");
                fullText += pageText + " \n";
            }

            return fullText;
        } catch (err) {
            console.error("PDF Parse error:", err);
            throw new Error("Failed to read PDF file. Make sure it's a valid, unencrypted text-based PDF.");
        }
    }

    // --- Form Submission & API Call --- //

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide errors and results
        errorState.classList.add('hidden');
        resultsSection.classList.remove('opacity-100');
        resultsSection.classList.add('opacity-0');

        // Wait a tiny bit to allow fade out animation if it was visible
        setTimeout(() => resultsSection.classList.add('hidden'), 300);

        const jobDesc = jobDescriptionInput.value.trim();
        const pdfFile = resumeFileInput.files[0];

        if (!jobDesc) {
            showError("Please paste the job description.");
            return;
        }

        if (!pdfFile || !pdfFile.type.includes("pdf")) {
            showError("Please upload a valid PDF resume document.");
            return;
        }

        setLoading(true);

        try {
            // 1. Local Browser Processing
            const resumeText = await extractPdfText(pdfFile);

            if (resumeText.replace(/\s/g, '').length < 50) {
                throw new Error("Could not extract enough text from the PDF. It may be an image-only scan.");
            }

            // 2. Network Request to AWS API Gateway
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    job_description: jobDesc,
                    resume_text: resumeText
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Server API Error (${response.status}): ${errText}`);
            }

            const data = await response.json();

            // 3. Update DOM with Results
            renderResults(data);

        } catch (err) {
            showError(err.message);
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.classList.add('cursor-wait', 'opacity-90');
            // Animate background string for gradient
            submitBtn.classList.add('animate-pulse');
            btnText.innerHTML = 'Analyzing Matrix...';
            btnLoader.classList.remove('hidden');
        } else {
            submitBtn.disabled = false;
            submitBtn.classList.remove('cursor-wait', 'opacity-90', 'animate-pulse');
            btnText.innerHTML = `Analyze Match <svg class="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>`;
            btnLoader.classList.add('hidden');
        }
    }

    function showError(message) {
        errorText.textContent = message;
        errorState.classList.remove('hidden');
    }

    // --- Render Output Graphics --- //

    function renderResults(data) {
        // Clear previous
        matchingKeywordsBox.innerHTML = '';
        missingKeywordsBox.innerHTML = '';
        scoreValue.textContent = '0';

        const score = Math.max(0, Math.min(100, data.ats_score || 0));

        // Mathematics for circle SVG (r=62) -> circumference approx 389.5
        const circumference = 389.5;
        const offset = circumference - (score / 100) * circumference;

        // Thematic styling based on score thresholds
        scoreProgress.classList.remove('text-emerald-400', 'text-amber-400', 'text-rose-400');
        scoreBgGlow.className = "absolute inset-0 z-0 opacity-50 transition-opacity duration-500 group-hover:opacity-100";
        scoreLabel.className = "mt-4 text-xs font-bold uppercase tracking-widest z-10 px-3 py-1 rounded-full border";

        if (score >= 75) {
            scoreProgress.classList.add('text-emerald-400');
            scoreBgGlow.classList.add('bg-gradient-to-br', 'from-emerald-500/10', 'to-cyan-500/10');
            scoreLabel.textContent = "Excellent";
            scoreLabel.classList.add('bg-emerald-500/10', 'text-emerald-400', 'border-emerald-500/30');
        } else if (score >= 50) {
            scoreProgress.classList.add('text-amber-400');
            scoreBgGlow.classList.add('bg-gradient-to-br', 'from-amber-500/10', 'to-orange-500/10');
            scoreLabel.textContent = "Average";
            scoreLabel.classList.add('bg-amber-500/10', 'text-amber-400', 'border-amber-500/30');
        } else {
            scoreProgress.classList.add('text-rose-400');
            scoreBgGlow.classList.add('bg-gradient-to-br', 'from-rose-500/10', 'to-red-500/10');
            scoreLabel.textContent = "Needs Work";
            scoreLabel.classList.add('bg-rose-500/10', 'text-rose-400', 'border-rose-500/30');
        }

        // Keywords injection
        const matching = data.matching_keywords || [];
        const missing = data.missing_keywords || [];

        if (matching.length === 0) {
            matchingKeywordsBox.innerHTML = '<span class="text-slate-500 text-sm italic w-full text-center py-2">No key matches found.</span>';
        } else {
            matching.forEach(kw => {
                const el = document.createElement('span');
                el.className = "pill px-3 py-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-md text-sm font-medium shadow-sm flex items-center";
                el.innerHTML = `<svg class="w-3.5 h-3.5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>${kw}`;
                matchingKeywordsBox.appendChild(el);
            });
        }

        if (missing.length === 0) {
            missingKeywordsBox.innerHTML = '<span class="text-slate-500 text-sm italic w-full text-center py-2">Looks solid! No major missing keywords.</span>';
        } else {
            missing.forEach(kw => {
                const el = document.createElement('span');
                el.className = "pill px-3 py-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-md text-sm font-medium shadow-sm flex items-center";
                el.innerHTML = `<svg class="w-3.5 h-3.5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>${kw}`;
                missingKeywordsBox.appendChild(el);
            });
        }

        // Text output
        feedbackText.textContent = data.actionable_feedback || "No actionable feedback was returned from the AI.";

        // Reveal Section sequentially
        resultsSection.classList.remove('hidden');
        // Browser hack to force reflow before adding opacity
        void resultsSection.offsetWidth;
        resultsSection.classList.add('opacity-100');

        // Scroll to the results block smoothly
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);

        // Graphics entry animations
        setTimeout(() => {
            scoreProgress.style.strokeDashoffset = offset;

            // Numeric counter lerp
            let current = 0;
            const duration = 1500; //ms matching css transition
            const fps = 60;
            const ticks = duration / (1000 / fps);
            const inc = score / ticks;

            const timer = setInterval(() => {
                current += inc;
                if (current >= score) {
                    current = score;
                    clearInterval(timer);
                }
                scoreValue.textContent = Math.round(current);
            }, 1000 / fps);

        }, 400); // Slight delay for dramatic effect
    }
});
