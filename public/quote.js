const quote = document.querySelector(".quote");
const author = document.querySelector(".author");

const api = "https://api.api-ninjas.com/v1/quotes";
const options = {
    method: 'GET',
    url: 'https://api.api-ninjas.com/v1/quotes',
    headers: { 'X-Api-Key': 'PMD5ufRcuT2d/xajR8Sc2w==RrCiyyHC1Qp4Sea5' },
    contentType: 'application/json',
    
}

async function getQuote() { 
    const response = await fetch(api, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }   
    const data = await response.json();
    quote.textContent = data[0].quote;
    author.textContent = "~ " + data[0].author;
}
getQuote();