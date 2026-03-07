const fs = require('fs');
const https = require('https');
const cheerio = require('cheerio');

const BASE_URL = 'https://catalog.colorado.edu';
const INDEX_URL = `${BASE_URL}/courses-a-z/`;

// Configurable concurrency limit to avoid hammering the server
const CONCURRENCY_LIMIT = 5;
const DELAY_MS = 300; // polite delay between requests (ms)

function fetchHTML(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : BASE_URL + res.headers.location;
                return fetchHTML(redirectUrl).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let html = '';
            res.on('data', (chunk) => { html += chunk; });
            res.on('end', () => resolve(html));
        }).on('error', reject);
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCourses(html, departmentUrl) {
    const $ = cheerio.load(html);
    const courses = [];

    $('.courseblock').each((index, element) => {
        const titleElement = $(element).find('.courseblocktitle strong');
        const descElement = $(element).find('.courseblockdesc');

        if (titleElement.length > 0) {
            let fullTitle = titleElement.text().trim().replace(/\s+/g, ' ');

            let code = '';
            let credits = '';
            let name = '';

            const creditMatch = fullTitle.match(/\(([0-9\-.]+)\)/);
            if (creditMatch) {
                credits = creditMatch[1];
                const parts = fullTitle.split(creditMatch[0]);
                code = parts[0].trim();
                if (parts.length > 1) {
                    name = parts[1].trim();
                }
            } else {
                code = fullTitle;
            }

            let description = descElement.length > 0
                ? descElement.text().trim().replace(/\s+/g, ' ')
                : '';

            // Clean non-breaking spaces
            description = description.replace(/\u00a0/g, ' ');
            code = code.replace(/\u00a0/g, ' ');
            name = name.replace(/\u00a0/g, ' ');

            let requisites = [];
            $(element).find('p').each((i, p) => {
                const text = $(p).text();
                const reqIndex = text.indexOf('Requisites:');
                if (reqIndex !== -1) {
                    const reqText = text
                        .substring(reqIndex + 'Requisites:'.length)
                        .split('.Additional Information:')[0]
                        .trim()
                        .replace(/\u00a0/g, ' ');

                    const codes = [...reqText.matchAll(/([A-Z]{4} \d{4})/g)].map(m => m[1]);
                    const parts = reqText.split(' and ');
                    let idx = 0;
                    requisites = [];
                    for (let part of parts) {
                        const numOr = (part.match(/ or /g) || []).length;
                        const numCodes = numOr + 1;
                        const group = codes.slice(idx, idx + numCodes);
                        if (group.length === 1) {
                            requisites.push(group[0]);
                        } else if (group.length > 1) {
                            requisites.push(group);
                        }
                        idx += numCodes;
                    }
                }
            });

            courses.push({
                code,
                title: name,
                credits,
                description,
                requisites,
                source_url: departmentUrl
            });
        }
    });

    return courses;
}

async function getDepartmentLinks() {
    console.log(`Fetching department index from ${INDEX_URL}...`);
    const html = await fetchHTML(INDEX_URL);
    const $ = cheerio.load(html);

    const links = new Set();
    // Links are typically listed as relative paths like /courses-a-z/csci/
    $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.startsWith('/courses-a-z/') && href !== '/courses-a-z/') {
            links.add(BASE_URL + href.replace(/\/$/, '') + '/');
        }
    });

    return [...links];
}

async function scrapeWithConcurrency(urls, concurrency) {
    const allCourses = [];
    const total = urls.length;
    let completed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);

        const results = await Promise.allSettled(
            batch.map(async (url) => {
                await sleep(DELAY_MS);
                const html = await fetchHTML(url);
                const courses = parseCourses(html, url);
                return { url, courses };
            })
        );

        for (const result of results) {
            completed++;
            if (result.status === 'fulfilled') {
                const { url, courses } = result.value;
                allCourses.push(...courses);
                console.log(`  [${completed}/${total}] ✓ ${url} — ${courses.length} courses`);
            } else {
                failed++;
                console.error(`  [${completed}/${total}] ✗ Failed: ${result.reason?.message}`);
            }
        }
    }

    console.log(`\nCompleted: ${completed - failed} succeeded, ${failed} failed.`);
    return allCourses;
}

async function main() {
    try {
        const departmentLinks = await getDepartmentLinks();
        console.log(`Found ${departmentLinks.length} department pages.\n`);

        if (departmentLinks.length === 0) {
            console.error('No department links found. The page structure may have changed.');
            process.exit(1);
        }

        console.log(`Scraping all departments (concurrency: ${CONCURRENCY_LIMIT})...\n`);
        const allCourses = await scrapeWithConcurrency(departmentLinks, CONCURRENCY_LIMIT);

        console.log(`\nTotal courses scraped: ${allCourses.length}`);

        const outputFile = 'all_courses.json';
        fs.writeFileSync(outputFile, JSON.stringify(allCourses, null, 2));
        console.log(`Saved to ${outputFile}`);

    } catch (err) {
        console.error('Fatal error:', err.message);
        process.exit(1);
    }
}