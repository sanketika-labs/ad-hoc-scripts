/**
 * create-batches-from-hierarchy.js
 *
 * Reads courseHeirarchy.json in the same directory:
 * {
 *   "rootCourse": "do_1234567890",
 *   "mathGrade6": "do_0987654321",
 *   "scienceGrade8": "do_1122334455"
 * }
 *
 * ➜ node create-batches-from-hierarchy.js
 *    └─ creates a batch for each course ID in the JSON.
 */

require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const qs = require('qs');

const API_BASE_URL = 'http://localhost:8080';

const LAST_PUBLISHED_BY = '<<content-creator-userid>>';
const CHANNEL_ID = '<<channel-id>>';
const CREATED_BY = '<<content-creator-userid>>';
const LIVE_URL = '<<host>>';
const CLIENT_ID = '<<client-id>>';
const CLIENT_SECRET = '<<client-secret>>';
const USERNAME = '<<content-creator-username>>';
const PASSWORD = '<<content-creator-password>>';
const REALM = 'sunbird';
const API_KEY = 'Bearer <<api-key>>';


if (!CLIENT_SECRET || !USERNAME || !PASSWORD || !API_KEY) {
  console.error('❌  Missing required env vars (CLIENT_SECRET, USERNAME, PASSWORD, API_KEY).');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────
// AUTH HELPERS
// ────────────────────────────────────────────────────────────
// Function to obtain access and refresh tokens
async function getTokens() {
  const tokenUrl = `${LIVE_URL}/auth/realms/${REALM}/protocol/openid-connect/token`;
  const data = qs.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'password',
    username: USERNAME,
    password: PASSWORD,
  });

  try {
    const response = await axios.post(tokenUrl, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data; // Contains access_token and refresh_token
  } catch (error) {
    console.error('Error obtaining tokens:');
    throw error;
  }
}

// Function to refresh the access token using the refresh token
async function refreshAccessToken(refreshToken) {
  const tokenUrl = `${LIVE_URL}/auth/v1/refresh/token`;
  const data = qs.stringify({
    refresh_token: refreshToken,
  });

  try {
    const response = await axios.post(tokenUrl, data, {
      headers: {
        Authorization: API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data; // Contains new access_token and refresh_token
  } catch (error) {
    console.error('Error refreshing access token:');
    throw error;
  }
}

// ────────────────────────────────────────────────────────────
// BATCH-CREATION UTILITIES
// ────────────────────────────────────────────────────────────
const batchUrl = `${LIVE_URL}/api/course/v1/batch/create`;

// const randomName = () => `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;

const yyyymmdd = (d) => d.toISOString().split('T')[0];

function dateRange() {
  const start = new Date(),
    end = new Date(start);
  end.setDate(start.getDate() + 90);
  return { startDate: yyyymmdd(start), endDate: yyyymmdd(end) };
}

async function getCourse(courseCode, contentCreatorToken) {
  const url = `${LIVE_URL}/api/composite/v1/search`;
  const payload = { request: { filters: { code: courseCode } } };

  const res = await axios.post(url, payload, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Channel-Id': CHANNEL_ID,
      'Authorization': API_KEY,
      'x-authenticated-user-token': contentCreatorToken,
    }
  });

  const courses = res.data.result.content;
  if (!courses || courses.length === 0) throw new Error(`Course not found: ${courseCode}`);
  const course = courses[0];
  return { courseId: course.identifier };
}

async function createBatch(courseId, batchName, userToken) {
  const { startDate, endDate } = dateRange();

  const payload = {
    request: {
      courseId,
      name: batchName,
      description: '',
      enrollmentType: 'open',
      startDate: startDate,
      createdBy: CREATED_BY,
      createdFor: [CHANNEL_ID],
      mentors: [],
      tandc: true,
    },
  };

  console.log(`payload - ${JSON.stringify(payload)}`);

  const { data } = await axios.post(batchUrl, payload, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Channel-Id': CHANNEL_ID,
      Authorization: API_KEY,
      'x-authenticated-user-token': userToken,
    },
  });

  return data.result.batchId;
}

// ────────────────────────────────────────────────────────────
// MAIN FLOW
// ────────────────────────────────────────────────────────────
(async () => {

  console.log(`🔐  Getting tokens for ${USERNAME} …`);
  const initialTokens = await getTokens();
  const refreshedTokens = await refreshAccessToken(initialTokens.refresh_token);

  const allRows = [];

  fs.createReadStream('./csv/batch.csv')
    .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
    .on('data', (row) => {
      allRows.push(row);
    })
    .on('end', async () => {
      for (const row of allRows) {
        const learnerProfileCode = row.learner_profile_code.trim();
        const codes = row.course_code.split(',').map(c => c.trim().replace(/"/g, ''));

        // 4.b Iterate and create batches
        for (const [idx, courseCode] of codes.entries()) {
          try {
            const { courseId } = await getCourse(courseCode, refreshedTokens.result.access_token);

            const batchName = courseCode + "_" + learnerProfileCode;
            console.log(`\n(${idx + 1}/${codes.length}) 🚀  Creating batch ${batchName} for course ${courseCode}-${courseId} …`);
            const batchId = await createBatch(courseId, batchName, refreshedTokens.result.access_token);
            console.log(`✅  Batch created  →  ${batchId}`);
            // console.log(`✅  Batch created `);
          } catch (err) {
            console.log(err);
            console.error(`❌  Failed for ${courseCode}:`);
            console.error(err.response?.data || err.message);
          }
        }

      }
    });

  console.log('\n🎉  Done.');
})();
