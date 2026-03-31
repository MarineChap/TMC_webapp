/**
 * Tests for the edit/update workflow:
 *  - Server-side index-based item replacement
 *  - Client-side keptImages logic (image removal)
 *  - Rich HTML text round-trip
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, 'test-db-tmp.json');

// ── Replicated DB helpers ──────────────────────────────────────────────────

async function loadDb() {
    const data = await fs.readFile(TEST_DB, 'utf-8');
    return JSON.parse(data);
}

async function saveDb(data: any) {
    await fs.writeFile(TEST_DB, JSON.stringify(data, null, 2), 'utf-8');
}

// ── Replicated /api/update logic ──────────────────────────────────────────

async function apiUpdate(category: string, originalIndex: number, updatedItem: any) {
    const dbData = await loadDb();
    if (!dbData[category]) throw new Error('Invalid category');
    if (originalIndex < 0 || originalIndex >= dbData[category].length)
        throw new Error('Item not found');
    dbData[category][originalIndex] = updatedItem;
    await saveDb(dbData);
    return { status: 'success' };
}

// ── Replicated client save-handler logic ──────────────────────────────────
// Mirrors the buildFormData section of the saveBtn click handler in script.ts.

function buildFormData(
    formFields: Record<string, any>,  // values collected from inputs (excl. file)
    keptImages: Record<string, string[]>,
    uploadedPaths: string[]
): Record<string, any> {
    const formData: Record<string, any> = { ...formFields };

    if (uploadedPaths.length > 0) {
        // New upload wins over keptImages
        const name = formFields.__fileFieldName || 'images';
        formData[name] = name === 'images' ? uploadedPaths : uploadedPaths[0];
    } else {
        // Edit mode: apply keptImages
        for (const [fieldName, paths] of Object.entries(keptImages)) {
            if (paths.length > 0) {
                formData[fieldName] = fieldName === 'images' ? paths : paths[0];
            }
            // paths.length === 0 → field intentionally omitted (all images removed)
        }
    }
    return formData;
}

// ── Test runner ───────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string) {
    if (condition) {
        console.log(`  ✓  ${message}`);
        passed++;
    } else {
        console.error(`  ✗  ${message}`);
        failed++;
        errors.push(message);
    }
}

function assertEq(actual: any, expected: any, message: string) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        console.error(`  ✗  ${message}`);
        console.error(`     expected: ${JSON.stringify(expected)}`);
        console.error(`     actual  : ${JSON.stringify(actual)}`);
        failed++;
        errors.push(message);
    } else {
        console.log(`  ✓  ${message}`);
        passed++;
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────

const INITIAL_DB = {
    chiefMessages: [
        {
            text: '<p>Hello <strong>World</strong></p>',
            images: ['/assets/img1.jpg', '/assets/img2.jpg'],
            author: 'marine',
            displayAuthor: true
        },
        {
            text: '<p>Second message</p>',
            images: ['/assets/img3.jpg'],
            author: 'marine',
            displayAuthor: false
        }
    ],
    amicalistMessages: [],
    recruits: [],
    events: [],
    flashNews: [],
    sdmisNews: []
};

async function setup() {
    await saveDb(JSON.parse(JSON.stringify(INITIAL_DB)));
}

async function runTests() {
    await setup();

    // ── SERVER TESTS ──────────────────────────────────────────────────────

    console.log('\n--- Server: index-based update ---');

    console.log('\nTest 1: Update text of first message');
    {
        await setup();
        const updated = { ...INITIAL_DB.chiefMessages[0], text: '<p>Updated text</p>' };
        await apiUpdate('chiefMessages', 0, updated);
        const db = await loadDb();
        assertEq(db.chiefMessages[0].text, '<p>Updated text</p>', 'text is updated');
        assertEq(db.chiefMessages[0].images, ['/assets/img1.jpg', '/assets/img2.jpg'], 'images untouched');
        assertEq(db.chiefMessages[1].text, '<p>Second message</p>', 'second message untouched');
    }

    console.log('\nTest 2: Remove one image — index 0');
    {
        await setup();
        const updated = { ...INITIAL_DB.chiefMessages[0], images: ['/assets/img1.jpg'] };
        await apiUpdate('chiefMessages', 0, updated);
        const db = await loadDb();
        assertEq(db.chiefMessages[0].images, ['/assets/img1.jpg'], 'one image remains');
    }

    console.log('\nTest 3: Remove all images');
    {
        await setup();
        const { images: _removed, ...withoutImages } = INITIAL_DB.chiefMessages[0];
        await apiUpdate('chiefMessages', 0, withoutImages);
        const db = await loadDb();
        assert(!db.chiefMessages[0].images, 'images key absent');
    }

    console.log('\nTest 4: Update second item (index 1) without touching index 0');
    {
        await setup();
        const updated = { ...INITIAL_DB.chiefMessages[1], text: '<p>Changed second</p>' };
        await apiUpdate('chiefMessages', 1, updated);
        const db = await loadDb();
        assertEq(db.chiefMessages[0].text, '<p>Hello <strong>World</strong></p>', 'index 0 unchanged');
        assertEq(db.chiefMessages[1].text, '<p>Changed second</p>', 'index 1 updated');
    }

    console.log('\nTest 5: Out-of-bounds index throws');
    {
        await setup();
        try {
            await apiUpdate('chiefMessages', 99, { text: 'x' });
            assert(false, 'should have thrown for index 99');
        } catch (e: any) {
            assertEq(e.message, 'Item not found', 'correct error message');
        }
    }

    console.log('\nTest 6: Rich HTML text survives JSON round-trip');
    {
        await setup();
        const richText = '<p>Texte <strong>gras</strong>, <em>italique</em></p><ul><li>Point 1</li><li>Point 2</li></ul>';
        await apiUpdate('chiefMessages', 0, { ...INITIAL_DB.chiefMessages[0], text: richText });
        const db = await loadDb();
        assertEq(db.chiefMessages[0].text, richText, 'rich HTML preserved exactly');
    }

    // ── CLIENT LOGIC TESTS ────────────────────────────────────────────────

    console.log('\n--- Client: buildFormData / keptImages ---');

    console.log('\nTest 7: No removal, no new upload → keptImages preserved as-is');
    {
        const fields = { text: '<p>Hi</p>', displayAuthor: true };
        const keptImages = { images: ['/assets/img1.jpg', '/assets/img2.jpg'] };
        const result = buildFormData(fields, keptImages, []);
        assertEq(result.images, ['/assets/img1.jpg', '/assets/img2.jpg'], 'both images kept');
    }

    console.log('\nTest 8: One image removed via thumbnail X');
    {
        const fields = { text: '<p>Hi</p>', displayAuthor: true };
        const keptImages = { images: ['/assets/img1.jpg'] }; // img2 removed by user
        const result = buildFormData(fields, keptImages, []);
        assertEq(result.images, ['/assets/img1.jpg'], 'only img1 remains');
    }

    console.log('\nTest 9: All images removed → images key absent from formData');
    {
        const fields = { text: '<p>Hi</p>', displayAuthor: true };
        const keptImages = { images: [] };
        const result = buildFormData(fields, keptImages, []);
        assert(!result.images, 'images key absent when all removed');
    }

    console.log('\nTest 10: New upload replaces keptImages entirely');
    {
        const fields = { text: '<p>Hi</p>', displayAuthor: true };
        const keptImages = { images: ['/assets/img1.jpg'] };
        const result = buildFormData(fields, keptImages, ['/assets/newfile.jpg']);
        assertEq(result.images, ['/assets/newfile.jpg'], 'new upload wins');
    }

    console.log('\nTest 11: Single image field (recruit) keeps string format');
    {
        const fields = { name: 'Jean Dupont', description: 'New recruit' };
        const keptImages = { image: ['/assets/recruit1.jpg'] }; // stored as array internally
        const result = buildFormData(fields, keptImages, []);
        assertEq(result.image, '/assets/recruit1.jpg', 'single image stored as string');
    }

    // ── Cleanup ───────────────────────────────────────────────────────────
    await fs.unlink(TEST_DB);

    console.log(`\n${'─'.repeat(45)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        console.error('Failed tests:', errors);
        process.exit(1);
    }
}

runTests().catch(e => { console.error(e); process.exit(1); });
