require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Load mappings
const hierarchyMap = JSON.parse(fs.readFileSync('./courseHierarchyMap.json', 'utf-8'));
const COOKIE = "connect.sid=s%3AT7Rip4_Nnqh4ItogC2D0giGjodCNJjig.s46vJf96Q5D%2BEWN4dI4Zc5VghYxN3KuLvcbjrcWKz40";
const LAST_PUBLISHED_BY = '72813dc0-e217-45c3-b01a-0067a7d611fb'; // as per your example

const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-App-Id': 'staging.sunbird.portal',
    'X-Device-ID': '1375cb2e33727bd1ab8f2bbb3a7d92ff',
    'X-Source': 'web',
    'User-Agent': 'Mozilla/5.0',
    'Cookie': COOKIE
};

// //Code for dev-fmps when API does not work
// const reviewCourse = async (doId) => {
//     const url = `https://dev-fmps.sunbirded.org/action/content/v3/review/${doId}`;
//     try {
//         const response = await axios.post(url, { request: { content: {} } }, { headers });
//         console.log(`✅ Reviewed: ${doId}`);
//         return true;
//     } catch (err) {
//         console.error(`❌ Review failed: ${doId}`, err.response?.data || err.message);
//         return false;
//     }
// };

const reviewCourse = async (doId) => {
    const url = `http://localhost:8080/content/v3/review/${doId}`;
    try {
        const response = await axios.post(url, { headers });
        console.log(`✅ Reviewed: ${doId}`);
        return true;
    } catch (err) {
        console.error(`❌ Review failed: ${doId}`, err.response?.data || err.message);
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
        console.error(`❌ Publish failed: ${doId}`, err.response?.data || err.message);
    }
};

(async () => {
    for (const doId of Object.keys(hierarchyMap)) {
        const reviewed = await reviewCourse(doId);
        if (reviewed) {
            await publishCourse(doId);
        }
    }
})();