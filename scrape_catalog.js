const fs = require('fs');
const https = require('https');
const cheerio = require('cheerio');

const url = 'https://catalog.colorado.edu/courses-a-z/csci/';

console.log(`Fetching data from ${url}...`);

https.get(url, (res) => {
    let html = '';

    res.on('data', (chunk) => {
        html += chunk;
    });

    res.on('end', () => {
        console.log('HTML fetched successfully. Parsing courses with Cheerio...');
        const $ = cheerio.load(html);
        const courses = [];
        
        $('.courseblock').each((index, element) => {
            const titleElement = $(element).find('.courseblocktitle strong');
            const descElement = $(element).find('.courseblockdesc');
            
            if (titleElement.length > 0) {
                // Ensure nice spacing
                let fullTitle = titleElement.text().trim();
                fullTitle = fullTitle.replace(/\s+/g, ' '); 

                let code = '';
                let credits = '';
                let name = '';

                // Typical Format: "CSCI 1300 (4) Computer Science 1: Starting Computing"
                // Match "(4)" or "(1-3)" to extract credits and split string
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

                let description = descElement.length > 0 ? descElement.text().trim().replace(/\s+/g, ' ') : '';
                
                // Sometimes descriptions or titles contain a non-breaking space character, we clean it
                description = description.replace(/\u00a0/g, ' ');
                code = code.replace(/\u00a0/g, ' ');
                name = name.replace(/\u00a0/g, ' ');

                let requisites = [];
                $(element).find('p').each((i, p) => {
                    const text = $(p).text();
                    const reqIndex = text.indexOf('Requisites:');
                    if (reqIndex !== -1) {
                        const reqText = text.substring(reqIndex + 'Requisites:'.length).split('.Additional Information:')[0].trim().replace(/\u00a0/g, ' ');
                        const codes = [...reqText.matchAll(/([A-Z]{4} \d{4})/g)].map(m => m[1]);
                        const parts = reqText.split(' and ');
                        let index = 0;
                        requisites = [];
                        for (let part of parts) {
                            const numOr = (part.match(/ or /g) || []).length;
                            const numCodes = numOr + 1;
                            const group = codes.slice(index, index + numCodes);
                            if (group.length === 1) {
                                requisites.push(group[0]);
                            } else if (group.length > 1) {
                                requisites.push(group);
                            }
                            index += numCodes;
                        }
                    }
                });

                courses.push({
                    code: code,
                    title: name,
                    credits: credits,
                    description: description,
                    requisites: requisites
                });
            }
        });

        console.log(`Found ${courses.length} courses!`);
        
        fs.writeFileSync('csci_courses.json', JSON.stringify(courses, null, 2));
        console.log('Successfully saved to csci_courses.json');
    });

}).on("error", (err) => {
    console.log("Error: " + err.message);
});
