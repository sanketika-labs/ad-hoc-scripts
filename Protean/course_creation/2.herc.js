// require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

// Config
const API_BASE_URL = 'http://localhost:8080';
const CHANNEL_ID = '01429195271738982411';
const UPDATED_BY = '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a';

// Load mappings
const hierarchyMap = JSON.parse(fs.readFileSync('./courseHierarchyMap.json', 'utf-8'));
const courseJson = JSON.parse(fs.readFileSync('./courses.json', 'utf-8'));

(async () => {
    for (const courseId in hierarchyMap) {
        const { courseName, moduleMap } = hierarchyMap[courseId];
        const originalCourse = courseJson.find(c => c.name === courseName);
        if (!originalCourse) {
            console.warn(`⚠️ Course metadata not found for "${courseName}", skipping...`);
            continue;
        }

        // Initialize nodesModified with course node
        const nodesModified = {
            [courseId]: {
                root: true,
                objectType: 'Content',
                isNew: false,
                metadata: {
                    name: originalCourse.name,
                    description: originalCourse.description,
                    primaryCategory: originalCourse.primaryCategory,
                    contentType: originalCourse.contentType,
                    additionalCategories: originalCourse.additionalCategories || [],
                    framework: originalCourse.framework,
                    organisationIds: originalCourse.organisationIds,
                    languageIds: originalCourse.languageIds,
                    audience: originalCourse.audience,
                    targetlanguageIds: originalCourse.targetlanguageIds || [],
                    targetcategoryIds: originalCourse.targetcategoryIds || [],
                    author: originalCourse.author,
                    copyright: originalCourse.copyright,
                    copyrightYear: 2024,
                    license: originalCourse.license,
                    attributions: [],
                    dialcodeRequired: 'No'
                }
            }
        };

        const hierarchy = {
            [courseId]: {
                name: originalCourse.name,
                children: [],
                root: true
            }
        };

        // Loop through modules
        for (const [moduleName, moduleData] of Object.entries(moduleMap)) {
            const moduleId = moduleData.id;
            const children = moduleData.children || [];

            // Append module to course's children
            hierarchy[courseId].children.push(moduleId);

            // Add module to nodesModified
            nodesModified[moduleId] = {
                root: false,
                objectType: 'Collection',
                isNew: true,
                metadata: {
                    mimeType: 'application/vnd.ekstep.content-collection',
                    name: moduleName,
                    visibility: 'Parent',
                    contentType: 'CourseUnit',
                    primaryCategory: 'Course Unit',
                    dialcodeRequired: 'No',
                    attributions: [],
                    description: moduleData.description || `Description for ${moduleName}`
                }
            };

            // Add module hierarchy
            hierarchy[moduleId] = {
                name: moduleName,
                children: children,
                root: false
            };
        }

        // Construct final payload
        const payload = {
            request: {
                data: {
                    nodesModified,
                    hierarchy,
                    lastUpdatedBy: UPDATED_BY
                }
            }
        };

        console.log(payload.request.data.hierarchy);

        try {
            const res = await axios.patch(`${API_BASE_URL}/content/v3/hierarchy/update`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Channel-Id': CHANNEL_ID
                }
            });

            console.log(`✅ Hierarchy updated for course "${courseName}" (${courseId})`);
        } catch (err) {
            console.error(`❌ Failed to update hierarchy for course "${courseName}" (${courseId})`);
            console.error(err.response?.data || err.message);
        }
    }
})();