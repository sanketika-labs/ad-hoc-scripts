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
const axios = require('axios');
const qs   = require('qs');

// ────────────────────────────────────────────────────────────
// 1. CONFIG  (all secrets live in .env; see sample at end)
// ────────────────────────────────────────────────────────────
// Load mappings
const HIERARCHY_FILE = './courseHierarchyMap.json';
const hierarchyMap = JSON.parse(fs.readFileSync('./courseHierarchyMap.json', 'utf-8'));

const API_BASE_URL = 'http://localhost:8080';

const LAST_PUBLISHED_BY = '<<creator-userid>>'; // as per your example
const CHANNEL_ID = '<<channel-id>>';
const CREATED_BY = '<<creator-userid>>';
const LIVE_URL = '<<host>>';
const CLIENT_ID = '<<client-id>>';
const CLIENT_SECRET = '<<client-secret>>';
const USERNAME = '<<creator-username>>';
const PASSWORD = '<<creator-password>>';
const REALM = '<<realm>>';
const API_KEY = 'Bearer <<api-key>>';


if (!CLIENT_SECRET || !USERNAME || !PASSWORD || !API_KEY) {
  console.error('❌  Missing required env vars (CLIENT_SECRET, USERNAME, PASSWORD, API_KEY).');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────
// 2. AUTH HELPERS
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
// 3. BATCH-CREATION UTILITIES
// ────────────────────────────────────────────────────────────
const batchUrl = `${LIVE_URL}/api/course/v1/batch/create`;

const randomName = () => `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;

const yyyymmdd = (d) => d.toISOString().split('T')[0];

function dateRange() {
  const start = new Date(),
        end   = new Date(start);
  end.setDate(start.getDate() + 90);
  return { startDate: yyyymmdd(start), endDate: yyyymmdd(end) };
}

async function createBatch(courseId, userToken) {
  const { startDate, endDate } = dateRange();

  const payload = {
    request: {
      courseId,
      name: randomName(),
      description: '',
      enrollmentType: 'open',
      startDate, endDate,
      createdBy: CREATED_BY,
      createdFor: [CHANNEL_ID],
      mentors: [],
      tandc: true,
    },
  };

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
// 4. MAIN FLOW
// ────────────────────────────────────────────────────────────
(async () => {
  // 4.a Load hierarchy JSON
  let hierarchy;
  try {
    hierarchy = JSON.parse(fs.readFileSync(HIERARCHY_FILE, 'utf8'));
  } catch (err) {
    console.error(`❌  Could not read ${HIERARCHY_FILE}:`, err.message);
    process.exit(1);
  }

  const courseIds = Object.keys(hierarchy);
  if (!courseIds.length) {
    console.error('⚠️  No course IDs found in JSON.');
    process.exit(0);
  }

  console.log(`🔐  Getting tokens for ${USERNAME} …`);
  const initialTokens = await getTokens();
 const refreshedTokens = await refreshAccessToken(initialTokens.refresh_token);

  // 4.b Iterate and create batches
  for (const [idx, courseId] of courseIds.entries()) {
    try {
      console.log(`\n(${idx + 1}/${courseIds.length}) 🚀  Creating batch for course ${courseId} …`);
      const batchId = await createBatch(courseId, refreshedTokens.result.access_token);
      console.log(`✅  Batch created  →  ${batchId}`);
    } catch (err) {
      console.error(`❌  Failed for ${courseId}:`);
      console.error(err.response?.data || err.message);
    }
  }

  console.log('\n🎉  Done.');
})();
