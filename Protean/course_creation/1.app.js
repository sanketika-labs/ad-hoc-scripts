// const dotenv = require('dotenv');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { readFileSync, writeFileSync } = require('fs');

// dotenv.config('./.env');
// console.log('Environment Variables:', process.env.BASE_URL)
// Load course data
const courses = JSON.parse(readFileSync('./courses.json', 'utf-8'));

// Config
const API_BASE_URL = 'http://localhost:8080';
const CHANNEL_ID = '<<channel-id>>';
const CREATED_BY = '<<creator-userid>>';
const LIVE_URL = '<<host>>';
const CLIENT_ID = '<<client-id>>';
const CLIENT_SECRET = '<<client-secret>>';
const USERNAME = '<<creator-username>>';
const PASSWORD = '<<creator-password>>';
const REALM = '<<realm>>';
const API_KEY = 'Bearer <<api-key>>';

// To hold live mapping for hierarchy update
const courseHierarchyMap = {}; // courseId => { courseName, moduleMap }

(async () => {
    for (const course of courses) {
        // 1. CREATE COURSE
        const coursePayload = {
            request: {
                content: {
                    name: course.name,
                    description: course.description,
                    code: course.code,
                    mimeType: course.mimeType,
                    createdBy: course.createdBy,
                    createdFor: course.createdFor,
                    contentType: course.contentType,
                    resourceType: course.resourceType,
                    creator: course.creator,
                    framework: course.framework,
                    organisation: [course.organisation],
                    primaryCategory: course.primaryCategory
                }
            }
        };

        let courseId;
        try {
            const courseRes = await axios.post(`${API_BASE_URL}/content/v3/create`, coursePayload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Channel-Id': CHANNEL_ID
                }
            });
            console.log('API_BASE_URL',API_BASE_URL);
            

            courseId = courseRes.data.result.identifier;
            console.log(`✅ Created course "${course.name}" → ID: ${courseId}`);
        } catch (err) {
            console.error(`❌ Failed to create course "${err}`);
            console.error(`❌ Failed to create course "${course.name}"`);
            console.error(err.response?.data || err.message);
            continue;
        }

        // Initialize mapping for this course
        courseHierarchyMap[courseId] = {
            courseName: course.name,
            moduleMap: {} // moduleName => { id, children }
        };


        // 2. CREATE MODULES IF HIERARCHY EXISTS
        const hierarchy = course.hierarchy;
        if (hierarchy && Object.keys(hierarchy).length > 0) {
            for (const [moduleName, children] of Object.entries(hierarchy)) {

                try {
                    courseHierarchyMap[courseId].moduleMap[moduleName] = {
                        id: uuidv4(),
                        children: children
                    };

                } catch (err) {
                    console.error(`❌ Failed to create module "${moduleName}"`);
                    console.error(err.response?.data || err.message);
                }
            }
        }
    }

    // 3. LOG FINAL STRUCTURE
    console.log(`\n📦 Final courseHierarchyMap:`);
    console.dir(courseHierarchyMap, { depth: null });

    // Optionally save it for use in next step
    writeFileSync('./courseHierarchyMap.json', JSON.stringify(courseHierarchyMap, null, 2));
})();