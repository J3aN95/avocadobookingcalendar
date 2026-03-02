import { readFileSync, writeFileSync } from 'fs';
import { load } from 'cheerio';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://www.avocadobooking.com';
const CONCERTS_PATH = join(__dirname, '..', 'concerts.js');

// Normalize city names with special characters to their English equivalents
const CITY_NAME_MAP = {
  'Köln': 'Cologne',
  'Koln': 'Cologne',
  'München': 'Munich',
  'Munchen': 'Munich',
  'Zürich': 'Zurich',
  'Nürnberg': 'Nuremberg',
  'Nurnberg': 'Nuremberg',
  'Nürburgring': 'Nurburgring',
  'Lüdenscheid': 'Ludenscheid',
  'Hradec Králové': 'Hradec Kralove',
  'Ieper': 'Ypres',
  'San Dona di Piave (VE)': 'San Dona di Piave',
  'Neunkirchen (Saarland)': 'Neunkirchen',
};

// Normalize country abbreviations/names
const COUNTRY_NAME_MAP = {
  'ROI': 'Ireland',
  'IE': 'Ireland',
  'BE': 'Belgium',
  'DE': 'Germany',
  'NL': 'Netherlands',
  'The Netherlands': 'Netherlands',
  'FR': 'France',
  'ES': 'Spain',
  'PT': 'Portugal',
  'AT': 'Austria',
  'CH': 'Switzerland',
  'IT': 'Italy',
  'CZ': 'Czech Republic',
  'PL': 'Poland',
  'SE': 'Sweden',
  'NO': 'Norway',
  'FI': 'Finland',
  'DK': 'Denmark',
  'HU': 'Hungary',
  'LV': 'Latvia',
  'EE': 'Estonia',
  'LT': 'Lithuania',
  'SI': 'Slovenia',
  'HR': 'Croatia',
  'RS': 'Serbia',
  'RO': 'Romania',
  'BG': 'Bulgaria',
  'GR': 'Greece',
  'SK': 'Slovakia',
  'LU': 'Luxembourg',
  'Czech Rep': 'Czech Republic',
  'Czech Rep.': 'Czech Republic',
};

function normalizeCity(city) {
  return CITY_NAME_MAP[city] || city;
}

function normalizeCountry(country) {
  return COUNTRY_NAME_MAP[country] || country;
}

// Rate-limited fetch with retry
async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AvocadoCalendarBot/1.0' }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`  Retry ${i + 1} for ${url}: ${err.message}`);
      await sleep(2000);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Load existing CITY_COORDS from concerts.js
function loadExistingCityCoords() {
  try {
    const content = readFileSync(CONCERTS_PATH, 'utf-8');
    const match = content.match(/const CITY_COORDS\s*=\s*(\{[\s\S]*?\});/);
    if (match) {
      return JSON.parse(match[1].replace(/\/\/.*$/gm, '').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'));
    }
  } catch {}
  return {};
}

// Parse date from DD.MM.YY to YYYY-MM-DD
function parseDate(dateStr) {
  const parts = dateStr.trim().split('.');
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Geocode a city using Nominatim
async function geocodeCity(city, country) {
  try {
    const q = encodeURIComponent(`${city}, ${country}`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AvocadoCalendarBot/1.0' }
    });
    const data = await res.json();
    if (data.length > 0) {
      return [parseFloat(parseFloat(data[0].lat).toFixed(2)), parseFloat(parseFloat(data[0].lon).toFixed(2))];
    }
  } catch (err) {
    console.warn(`  Geocoding failed for ${city}: ${err.message}`);
  }
  return null;
}

// Extract tour links from main page
async function getTourLinks() {
  console.log('Fetching main page...');
  const html = await fetchPage(`${BASE_URL}/avocms`);
  const $ = load(html);
  const links = [];
  $('a[href*="/avocms/item/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !links.includes(href)) {
      links.push(href);
    }
  });
  console.log(`Found ${links.length} tours`);
  return links;
}

// Parse a single tour page
async function parseTourPage(tourPath) {
  const url = tourPath.startsWith('http') ? tourPath : `${BASE_URL}${tourPath}`;
  const html = await fetchPage(url);
  const $ = load(html);

  // Extract artist name from h2
  const h2Elements = $('h2');
  let artist = '';
  let tourName = '';

  // Typically h2 contains the artist name; sometimes there's a second h2 with tour name
  h2Elements.each((i, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    if (!artist) {
      // First meaningful h2 could be tour name or artist name
      // Heuristic: if it contains "tour" or "europe" it's likely a tour name
      if (/tour|europe|summer|spring|winter|fall/i.test(text) && !artist) {
        tourName = text;
      } else {
        artist = text;
      }
    } else if (!tourName) {
      // Second h2 might be tour name or vice versa
      if (/tour|europe|summer|spring|winter|fall/i.test(text)) {
        tourName = text;
      } else {
        // Could be the actual artist, swap
        tourName = artist;
        artist = text;
      }
    }
  });

  // If no artist found from h2, try the slug
  if (!artist) {
    const slug = tourPath.split('/').pop();
    artist = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      .replace(/european tour.*|europe.*|tour.*/i, '').trim();
  }

  // If tourName still empty, use the other h2 or derive from slug
  if (!tourName) {
    tourName = artist;
  }

  // Extract support acts from h3
  let defaultSupport = '';
  const h3 = $('h3').first().text().trim();
  if (h3) {
    // h3 typically has "Artist1 | Artist2 | Artist3"
    defaultSupport = h3.replace(/\|/g, ',').replace(/\s*,\s*/g, ', ').trim();
  }

  // Parse concert table
  const concerts = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length < 4) return;

    const dateStr = $(cells[0]).text().trim();
    const date = parseDate(dateStr);
    if (!date) return; // Skip header rows or invalid dates

    const countryRaw = $(cells[1]).text().trim();
    const cityRaw = $(cells[2]).text().trim();
    const venue = $(cells[3]).text().trim();

    // Skip rows with empty city (e.g. "Day Off" rows)
    if (!cityRaw || !countryRaw || /day off/i.test(countryRaw) || /day off/i.test(cityRaw)) return;

    const country = normalizeCountry(countryRaw);
    const city = normalizeCity(cityRaw);

    // Info column (index 4) may contain support act overrides
    let info = cells.length > 4 ? $(cells[4]).text().trim() : '';

    // Ticket link (last column)
    let ticketUrl = '';
    const lastCell = cells.length > 5 ? cells[5] : cells.length > 4 ? cells[4] : null;
    if (lastCell) {
      const link = $(lastCell).find('a').attr('href');
      if (link) {
        ticketUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
      }
    }
    // If info column is actually the ticket column (has link but no text), adjust
    if (cells.length === 5) {
      const linkInInfo = $(cells[4]).find('a').attr('href');
      if (linkInInfo) {
        ticketUrl = linkInInfo.startsWith('http') ? linkInInfo : `${BASE_URL}${linkInInfo}`;
        info = '';
      }
    }

    // Determine support for this show
    let support = defaultSupport;
    if (info) {
      // "w/ Artist1, Artist2" pattern
      const wMatch = info.match(/w\/\s*(.+)/i);
      if (wMatch) {
        support = wMatch[1].replace(/\|/g, ',').replace(/\s*,\s*/g, ', ').trim();
      }
    }

    // Check for sold out
    const rowText = $(row).text().toLowerCase();
    const soldOut = rowText.includes('sold out') || rowText.includes('soldout');

    const concert = {
      date,
      artist,
      support,
      city,
      country,
      venue,
      tour: tourName,
      ticketUrl
    };
    if (soldOut) concert.soldOut = true;

    concerts.push(concert);
  });

  console.log(`  ${artist}: ${concerts.length} concerts`);
  return concerts;
}

// Generate concerts.js content
function generateConcertsJS(allConcerts, cityCoords) {
  // Sort concerts by date, then by artist
  allConcerts.sort((a, b) => {
    const da = a.date.localeCompare(b.date);
    if (da !== 0) return da;
    return a.artist.localeCompare(b.artist);
  });

  // Group concerts by tour for readability
  const tourGroups = {};
  for (const c of allConcerts) {
    const key = `${c.artist} - ${c.tour}`;
    if (!tourGroups[key]) tourGroups[key] = [];
    tourGroups[key].push(c);
  }

  let js = 'const CONCERTS_DATA = [\n';
  for (const [tourKey, concerts] of Object.entries(tourGroups)) {
    js += `  // === ${tourKey.toUpperCase()} ===\n`;
    for (const c of concerts) {
      const obj = { ...c };
      js += `  ${JSON.stringify(obj)},\n`;
    }
    js += '\n';
  }
  js += '];\n\n';

  // Write CITY_COORDS sorted alphabetically
  const sortedCities = Object.keys(cityCoords).sort();
  js += 'const CITY_COORDS = {\n';
  for (const city of sortedCities) {
    const [lat, lng] = cityCoords[city];
    js += `  "${city}": [${lat}, ${lng}],\n`;
  }
  js += '};\n';

  return js;
}

// Main
async function main() {
  console.log('=== Avocado Booking Scraper ===\n');

  // Load existing city coordinates
  const cityCoords = loadExistingCityCoords();
  console.log(`Loaded ${Object.keys(cityCoords).length} existing city coordinates\n`);

  // Get all tour links
  const tourLinks = await getTourLinks();

  // Parse each tour page
  const allConcerts = [];
  for (const link of tourLinks) {
    try {
      await sleep(500); // Be polite with requests
      const concerts = await parseTourPage(link);
      allConcerts.push(...concerts);
    } catch (err) {
      console.error(`  ERROR parsing ${link}: ${err.message}`);
    }
  }

  console.log(`\nTotal: ${allConcerts.length} concerts\n`);

  // Collect all unique cities and geocode missing ones
  const allCities = new Map();
  for (const c of allConcerts) {
    if (!allCities.has(c.city)) {
      allCities.set(c.city, c.country);
    }
  }

  const citiesToGeocode = [];
  for (const [city, country] of allCities) {
    if (!cityCoords[city] && city) {
      citiesToGeocode.push({ city, country });
    }
  }

  if (citiesToGeocode.length > 0) {
    console.log(`Geocoding ${citiesToGeocode.length} new cities...`);
    for (const { city, country } of citiesToGeocode) {
      const coords = await geocodeCity(city, country);
      if (coords) {
        cityCoords[city] = coords;
        console.log(`  ${city}: [${coords}]`);
      } else {
        console.warn(`  ${city}: NOT FOUND`);
      }
      await sleep(1100); // Nominatim rate limit: 1 req/sec
    }
    console.log('');
  }

  // Clean up CITY_COORDS: only keep cities that exist in concerts
  const usedCities = new Set(allConcerts.map(c => c.city));
  const cleanCoords = {};
  for (const city of usedCities) {
    if (cityCoords[city]) {
      cleanCoords[city] = cityCoords[city];
    }
  }

  // Generate and write concerts.js
  const output = generateConcertsJS(allConcerts, cleanCoords);
  writeFileSync(CONCERTS_PATH, output, 'utf-8');
  console.log(`Written ${CONCERTS_PATH}`);
  console.log(`  ${allConcerts.length} concerts, ${Object.keys(cleanCoords).length} cities`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
