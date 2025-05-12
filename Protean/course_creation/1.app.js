// const dotenv = require('dotenv');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { readFileSync, writeFileSync } = require('fs');

// dotenv.config('./.env');
console.log('Environment Variables:', process.env.BASE_URL)
// Load course data
const courses = JSON.parse(readFileSync('./courses.json', 'utf-8'));

// Config
const API_BASE_URL = 'http://localhost:8080';
const CHANNEL_ID = '01429195271738982411';
const CREATED_BY = '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a';

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
                    code: uuidv4(),
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
                const modulePayload = {
                    request: {
                        content: {
                            name: moduleName,
                            code: uuidv4(),
                            mimeType: "application/vnd.ekstep.content-collection",
                            contentType: "CourseUnit",
                            primaryCategory: "Course Unit",
                            createdBy: CREATED_BY,
                            framework: course.framework
                        }
                    }
                };

                try {
                    // const moduleRes = await axios.post(`${API_BASE_URL}/content/v3/create`, modulePayload, {
                    //     headers: {
                    //         'Content-Type': 'application/json',
                    //         'X-Channel-Id': CHANNEL_ID
                    //     }
                    // });

                    // const moduleId = moduleRes.data.result.identifier;
                    courseHierarchyMap[courseId].moduleMap[moduleName] = {
                        id: uuidv4(),
                        // module_do_id: moduleId,
                        children: children
                    };

                    // console.log(`  ↳ Created module "${moduleName}" → ID: ${moduleId}`);
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