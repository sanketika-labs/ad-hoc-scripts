require('dotenv').config();
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const { Parser } = require('json2csv');
const { log } = require('console');

const HOST = 'https://dev-fmps.sunbirded.org';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.-qfZEwBAoHFhxNqhGq7Vy_SNVcwB1AtMX8xbiVHF5FQ';
const CLIENT_ID = 'direct-grant';
const CLIENT_SECRET = '9fe26321-7cba-4131-8cf3-e02a951b81e2';
const GRANT_TYPE = 'password';
const CHANNEL_ID = '01429195271738982411';
const CREATOR_USERNAME = 'contentcreator-fmps';
const CREATOR_PASSWORD = 'CreatorFmps@123';
const CREATED_BY = '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a'

const outputRows = [];
const OUTPUT_FILE = 'output_report.csv';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getKeycloakToken(username, password) {
  const url = `${HOST}/auth/realms/sunbird/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', GRANT_TYPE);
  params.append('username', username);
  params.append('password', password);

  const res = await axios.post(url, params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${API_KEY}`,
    }
  });

  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const url = `${HOST}/auth/v1/refresh/token`;
  const params = new URLSearchParams();
  params.append('refresh_token', refreshToken);

  const res = await axios.post(url, params, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    }
  });

  return res.data.result;
}

async function getUserId(email, userAccessToken) {
  const url = `${HOST}/api/user/v1/search`;
  const payload = { request: { filters: { email } } };

  const res = await axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'x-authenticated-user-token': userAccessToken,
      'Content-Type': 'application/json',
    }
  });

  const users = res.data.result.response.content;
  if (!users || users.length === 0) throw new Error(`User not found for email ${email}`);
  return users[0].id;
}

async function getCourseAndBatch(courseCode, learningProfileCode, userToken) {
  const url = `${HOST}/api/composite/v1/search`;
  const payload = { request: { filters: { code: courseCode } } };

  const res = await axios.post(url, payload, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Channel-Id': CHANNEL_ID,
      'Authorization': `Bearer ${API_KEY}`,
      'x-authenticated-user-token': userToken,
    }
  });

  const courses = res.data.result.content;  
  if (!courses || courses.length === 0) throw new Error(`Course not found: ${courseCode}`);
  const course = courses[0];

  const batchUrl = `${HOST}/api/course/v1/batch/list`;
  const batchPayload = { request: { filters: { courseId: course.identifier, createdBy: CREATED_BY,  name: courseCode+"_"+learningProfileCode} } };

  const batchRes = await axios.post(batchUrl, batchPayload, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Channel-Id': CHANNEL_ID,
      'Authorization': `Bearer ${API_KEY}`,
      'x-authenticated-user-token': userToken,
    }
  });
  
  const batches = batchRes.data.result.response.content;  
  if (!batches || batches.length === 0) throw new Error(`No batch found for course ${courseCode}`);

  const batchId = batches?.find(b => b.name === courseCode+"_"+learningProfileCode)?.batchId;

  if (!batchId) throw new Error(`No batch found for course ${courseCode}`);
  return { courseId: course.identifier, batchId };
}

async function getContentIds(courseId, creatorAccessToken) {
  const url = `${HOST}/api/collection/v1/hierarchy/${courseId}`;
  const res = await axios.get(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'x-authenticated-user-token': creatorAccessToken,
    }
  });

  const traverse = (node, arr = []) => {
    if (node.contentType && node.contentType !== 'Course') {
      arr.push(node.identifier);
    }
    if (node.children) {
      node.children.forEach(child => traverse(child, arr));
    }
    return arr;
  };

  return traverse(res.data.result.content);
}

function getFormattedTimestamp() {
  const now = new Date();
  const pad = (num, size = 2) => num.toString().padStart(size, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  const milliseconds = pad(now.getMilliseconds(), 3);
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  const offsetHours = pad(Math.floor(absOffset / 60));
  const offsetMins = pad(absOffset % 60);
  const timezone = `${sign}${offsetHours}${offsetMins}`;
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}:${milliseconds}${timezone}`;
}

async function updateContentState(userId, contentId, batchId, courseId, userAccessToken) {
  const url = `${HOST}/api/course/v1/content/state/update`;
  const payload = {
    request: {
      userId,
      contents: [
        {
          contentId,
          batchId,
          status: 2,
          courseId,
          lastAccessTime: getFormattedTimestamp(),
        }
      ]
    }
  };

  await axios.patch(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'X-Channel-Id': CHANNEL_ID,
      'Authorization': `Bearer ${API_KEY}`,
      'x-authenticated-user-token': userAccessToken,
    }
  });
}

// Main execution
(async () => {
  try {
    const creatorTokenResp = await getKeycloakToken(CREATOR_USERNAME, CREATOR_PASSWORD);
    const creatorAccess = await refreshAccessToken(creatorTokenResp.refresh_token);
    console.log('Creator Access Token acquired');

    const allRows = [];

    fs.createReadStream('input.csv')
      .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
      .on('data', (row) => {
        allRows.push(row);
      })
      .on('end', async () => {
        for (const row of allRows) {
          const email = row.email.trim();
          const learningProfileCode = row.learning_profile_code.trim();
          const codes = row.course_code.split(',').map(c => c.trim().replace(/"/g, ''));

          console.log(`Processing: ${email}`);

          try {
            const userTokenResp = await getKeycloakToken(email, '');
            const userAccess = await refreshAccessToken(userTokenResp.refresh_token);
            const userId = await getUserId(email, userAccess.access_token);

            for (const code of codes) {
              try {
                const { courseId, batchId } = await getCourseAndBatch(code, learningProfileCode, creatorAccess.access_token, userAccess.access_token);
                const contentIds = await getContentIds(courseId, creatorAccess.access_token);
                  
                console.log(`Processing userId-${userId}, batchId-${batchId}, courseId-${courseId}`);
                for (const contentId of contentIds) {
                  await updateContentState(userId, contentId, batchId, courseId, userAccess.access_token);
                }

                outputRows.push({
                  email,
                  learningProfileCode,
                  course_code: code,
                  status: 'success',
                  remark: ''
                });
              } catch (err) {
                outputRows.push({
                  email,
                  learningProfileCode,
                  course_code: code,
                  status: 'failure',
                  remark: err.message
                });
              }

            }

            // Delay to prevent hitting the API rate limit
            await delay(200);

          } catch (err) {
            outputRows.push({
              email,
              learningProfileCode,
              course_code: row.course_code,
              status: 'failure',
              remark: err.message
            });
          }

        }

        const fields = ['email', 'learningProfileCode', 'course_code', 'status', 'remark'];
        const json2csvParser = new Parser({ fields });
        const csvData = json2csvParser.parse(outputRows);

        fs.writeFileSync(OUTPUT_FILE, csvData);
        console.log(`✅ Output report saved to ${OUTPUT_FILE}`);
      });

  } catch (err) {
    console.error('Initialization error:', err.message);
  }
})();
