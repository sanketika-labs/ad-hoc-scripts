require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');


const API_BASE_URL = process.env.BASE_URL;
const CHANNEL_ID = '01429195271738982411';
const CREATED_BY = '927c2094-987f-4e8f-8bd5-8bf93e3d2e8a';

const courses = JSON.parse(fs.readFileSync('./courses.json', 'utf-8'));

async function createAndUpdateCourse(course) {
    try {
        const code = uuidv4();

        // Step 1: Create
        const createRes = await axios.post(`${API_BASE_URL}/content/v3/create`, {
            request: {
                content: {
                    name: course.name,
                    code: code,
                    mimeType: 'application/vnd.ekstep.content-collection',
                    createdBy: CREATED_BY,
                    createdFor: [CHANNEL_ID],
                    contentType: course.contentType,
                    resourceType: course.resourceType,
                    creator: "Content Creator FMPS",
                    framework: "FMPS",
                    organisation: ["FMPS Org"],
                    primaryCategory: course.primaryCategory
                }
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': CHANNEL_ID
            }
        });

        const nodeId = createRes.data.result.node_id;
        console.log(`Created course: ${course.name}, ID: ${nodeId}`);

        // Step 2: Build hierarchy
        const hierarchy = {
            [nodeId]: {
                children: course.children || [],
                root: true
            }
        };

        if (course.children && course.children.length > 0) {
            course.children.forEach(childId => {
                hierarchy[childId] = {
                    children: [],
                    root: false
                };
            });
        }

        const updateRes = await axios.patch(`${API_BASE_URL}/content/v3/hierarchy/update`, {
            request: {
                data: {
                    nodesModified: {
                        [nodeId]: {
                            root: true,
                            objectType: 'Collection',
                            metadata: {
                                name: course.name,
                                description: `${course.name} description`,
                                mimeType: 'application/vnd.ekstep.content-collection',
                                relationalMetadata: {}
                            },
                            isNew: false
                        }
                    },
                    hierarchy,
                    lastUpdatedBy: CREATED_BY
                }
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'X-Channel-Id': CHANNEL_ID
            }
        });

        const contentId = updateRes.data.result.content_id || nodeId;
        console.log(`🔁 Hierarchy updated for: ${course.name}, ID: ${contentId}`);

        // Step 3: Review
        await axios.post(`${API_BASE_URL}/content/v3/review/${contentId}`, null, {
            headers: {
                Accept: 'application/json'
            }
        });
        console.log(`🔍 Sent for review: ${course.name}`);

        // Step 4: Publish
        await axios.post(`${API_BASE_URL}/content/v3/publish/${contentId}`, {
            request: {
                content: {
                    lastPublishedBy: CREATED_BY
                }
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json'
            }
        });
        console.log(` Published: ${course.name}\n`);

    } catch (error) {
        console.error(` Error processing ${course.name}:`, error.response?.data || error.message);
    }
}

async function main() {
    for (const course of courses) {
        await createAndUpdateCourse(course);
    }
}

main();