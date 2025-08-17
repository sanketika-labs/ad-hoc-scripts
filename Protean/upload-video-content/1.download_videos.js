const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csv-parser');
const sanitize = require('sanitize-filename');

const csvFile = './csv/master_data.csv';
const outputDir = './master_video_source';
const logFile = 'video_download_log.txt';
const MAX_CONCURRENT_DOWNLOADS = 15;

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

function log(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
}

function getDriveFileId(url) {
  const match = url.match(/\/d\/(.*?)(\/|$)/);
  return match ? match[1] : null;
}

function getDirectDownloadUrl(driveUrl) {
  const fileId = getDriveFileId(driveUrl);
  if (!fileId) return null;
  // return `https://drive.google.com/uc?export=download&id=${fileId}`;
  return `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
}

// async function downloadFileWithDriveBypass(url, outputPath) {
//   let response = await axios.get(url, {
//     responseType: 'stream',
//     headers: { 'User-Agent': 'Mozilla/5.0' },
//     maxRedirects: 5,
//     validateStatus: null,
//   });

//   if (response.headers['content-type'] && response.headers['content-type'].includes('text/html')) {
//     let data = '';
//     for await (const chunk of response.data) {
//       data += chunk.toString();
//     }
//     const confirmMatch = data.match(/confirm=([0-9A-Za-z-_]+)&/);
//     if (confirmMatch) {
//       const confirmToken = confirmMatch[1];
//       const fileId = getDriveFileId(url);
//       const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;
//       response = await axios.get(confirmUrl, {
//         responseType: 'stream',
//         headers: { 'User-Agent': 'Mozilla/5.0' },
//         maxRedirects: 5,
//       });
//     } else {
//       throw new Error('Could not bypass Google Drive confirmation.');
//     }
//   }

//   const writer = fs.createWriteStream(outputPath);
//   return new Promise((resolve, reject) => {
//     response.data.pipe(writer);
//     let error = null;
//     writer.on('error', err => {
//       error = err;
//       writer.close();
//       reject(err);
//     });
//     writer.on('close', () => {
//       if (!error) resolve();
//     });
//   });
// }


async function downloadFileWithDriveBypass(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);

  // Initial request
  let response = await axios.get(url, {
    responseType: 'stream',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    maxRedirects: 5,
    validateStatus: null,
  });

  if (response.headers['content-type'] && response.headers['content-type'].includes('text/html')) {
    let data = '';
    for await (const chunk of response.data) {
      data += chunk.toString();
    }

    // Check for "confirm" token (standard bypass scenario)
    const confirmMatch = data.match(/confirm=([0-9A-Za-z-_]+)&/);
    if (confirmMatch) {
      const confirmToken = confirmMatch[1];
      const fileId = getDriveFileId(url);
      // const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;
      const confirmUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`
      
      response = await axios.get(confirmUrl, {
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
      });
    } 
    // Check for "file too large" scenario
    else if (data.includes("Google Drive can't scan this file for viruses")) {
      const fileId = getDriveFileId(url);
      const alternativeUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;

      response = await axios.get(alternativeUrl, {
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
        validateStatus: null,
      });

      // Final check to ensure file stream
      if (response.headers['content-type'] && response.headers['content-type'].includes('text/html')) {
        throw new Error('Failed to bypass the large file confirmation.');
      }
    } 
    else {
      throw new Error('Could not bypass Google Drive confirmation.');
    }
  }

  // Write the final response stream to file
  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    let error = null;
    writer.on('error', err => {
      error = err;
      writer.close();
      reject(err);
    });
    writer.on('close', () => {
      if (!error) resolve();
    });
  });
}


const stripBom = (str) => str.replace(/^\uFEFF/, '');

async function downloadVideosConcurrently(results) {
  const queue = [];

  for (const row of results) {
    const name = sanitize(row['video_name'] || '');
    const url = row['content_url'];
    if (!name || !url) {
      log(`WARNING: Skipping due to missing name or URL. Row: ${JSON.stringify(row)}`);
      continue;
    }
    const outPath = path.join(outputDir, name.trim() + '.mp4');
    if (fs.existsSync(outPath)) {
      log(`INFO: File already exists, skipping download: ${outPath}`);
      continue;
    }
    const directUrl = getDirectDownloadUrl(url);
    if (!directUrl) {
      log(`ERROR: Could not parse Google Drive URL: ${url}`);
      continue;
    }

    queue.push({ name, directUrl, outPath });
  }

  const activeDownloads = [];

  while (queue.length > 0 || activeDownloads.length > 0) {
    while (activeDownloads.length < MAX_CONCURRENT_DOWNLOADS && queue.length > 0) {
      const { name, directUrl, outPath } = queue.shift();
      log(`INFO: Starting download: ${name} URL: ${directUrl}`);
      const downloadPromise = downloadFileWithDriveBypass(directUrl, outPath)
        .then(() => log(`INFO: Download successful: ${outPath}`))
        .catch(e => log(`ERROR: Failed to download ${name}: ${e.message} URL: ${directUrl}`))
        .finally(() => activeDownloads.splice(activeDownloads.indexOf(downloadPromise), 1));
      activeDownloads.push(downloadPromise);
    }
    await Promise.race(activeDownloads);
  }

  log('INFO: All downloads attempted.');
}

function main() {
  const results = [];

  fs.createReadStream(csvFile, { encoding: 'utf8' })
    .pipe(csv({ mapHeaders: ({ header }) => stripBom(header) }))
    .on('data', (row) => results.push(row))
    .on('end', () => {
      if (results.length === 0) {
        log('ERROR: No rows found in CSV. Please check the file.');
        return;
      }
      downloadVideosConcurrently(results);
    });
}

main();