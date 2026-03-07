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
                    if ($(p).text().includes('Requisites:')) {
                        $(p).find('a').each((j, a) => {
                            const href = $(a).attr('href');
                            if (href && href.startsWith('/search/?P=')) {
                                const code = decodeURIComponent(href.split('=')[1]);
                                requisites.push(code);
                            }
                        });
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
