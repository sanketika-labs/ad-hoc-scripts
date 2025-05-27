require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const qs = require('qs');



// Load mappings
const hierarchyMap = JSON.parse(fs.readFileSync('./courseHierarchyMap.json', 'utf-8'));
const LAST_PUBLISHED_BY = '5c0cc434-1d98-474c-85f3-a4dbd29b4e21'; // as per your example
const API_BASE_URL = 'http://localhost:8080';
const CHANNEL_ID = '0143146729170944000';
const CREATED_BY = '5c0cc434-1d98-474c-85f3-a4dbd29b4e21';
const LIVE_URL = 'https://maharat.fmps.ma';
const CLIENT_ID = 'direct-grant';
const CLIENT_SECRET = 'direct-grantC60KFP05Wt4WO3bs';
const USERNAME = 'contentcreator-fmps@yopmail.com';
const PASSWORD = 'CreatorFmps@123';
const REALM = 'sunbird';
// const API_KEY = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.-qfZEwBAoHFhxNqhGq7Vy_SNVcwB1AtMX8xbiVHF5FQ';
const API_KEY = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcGlfYWRtaW4ifQ.29h7_XRriDhgKQHWBV4aP49kv0yI6K1yxUCPDreWoEE';



const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-App-Id': 'staging.sunbird.portal',
    'X-Device-ID': '1375cb2e33727bd1ab8f2bbb3a7d92ff',
    'X-Source': 'web',
    'User-Agent': 'Mozilla/5.0',
};

const reviewCourse = async (doId) => {
    const url = `http://localhost:8080/content/v3/review/${doId}`;
    try {
        const response = await axios.post(url, { headers });
        console.log(`✅ Reviewed: ${doId}`);
        return true;
    } catch (err) {
        console.error(`❌ Review failed: ${doId}`);
        return false;
    }
};

const publishCourse = async (doId) => {
    const url = `http://localhost:8080/content/v3/publish/${doId}`;
    try {
        const response = await axios.post(
            url,
            { request: { content: { lastPublishedBy: LAST_PUBLISHED_BY } } },
            { headers: { ...headers} }
        );
        console.log(`🚀 Published: ${doId}`);
    } catch (err) {
        console.error(`❌ Publish failed: ${doId}`);
    }
};


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

// Function to create a course batch
async function createBatch(courseId,userToken) {
const batchUrl = `${LIVE_URL}/api/course/v1/batch/create`;
// Generate a random batch name in format BATCH-XXXX where X is a digit
const generateRandomBatchName = () => {
    const randomDigits = Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join('');
    return `BATCH-${randomDigits}`;
};

// Calculate dates - today and 90 days in future
const calculateDates = () => {
    const today = new Date(); // Current date (May 15, 2025)
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 90); // Add 90 days
    
    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    return {
        startDate: formatDate(today),
        endDate: formatDate(endDate)
    };
};

const batchName = generateRandomBatchName();
const { startDate, endDate } = calculateDates();

const payload = {
    request: {
    courseId: courseId,
    name: batchName,
    description: '',
    enrollmentType: 'open',
    startDate: startDate,
    endDate: endDate,
    createdBy: CREATED_BY,
    createdFor: [CHANNEL_ID],
    mentors: [],
    tandc: true,
    },
};

// console.log('Batch Payload:', JSON.stringify(payload, null, 2));

try {
    const response = await axios.post(batchUrl, payload, {
    headers: {
        'Content-Type': 'application/json',
        'X-Channel-Id': CHANNEL_ID,
        'Authorization': API_KEY,
        'x-authenticated-user-token': userToken,
    },
    });
    return response.data;
} catch (error) {
    console.error('Error creating batch:');
    // throw error;
}
}

(async () => {
    const initialTokens = await getTokens();
    const refreshedTokens = await refreshAccessToken(initialTokens.refresh_token);
    for (const doId of Object.keys(hierarchyMap)) {
        const reviewed = await reviewCourse(doId);
        if (reviewed) {
            await publishCourse(doId);
            // const batchResponse = await createBatch(doId,refreshedTokens.result.access_token);
            //     batchResponse.result.batchId ? console.log(`Batch ID: ${batchResponse.result.batchId}`) : console.log('No Batch ID found');
            // setInterval(async () => {
                
            // }, 3000);
        }
    }
})();