const assert = require('node:assert/strict');
const test = require('node:test');
const Note = require('../src/models/Note');
const Post = require('../src/models/Post');
const User = require('../src/models/User');
const parsePagination = require('../src/utils/pagination');
const {
  buildInterestGroupsPipeline,
  buildUserPostsPipeline,
} = require('../src/utils/aggregationPipelines');
const { requireAdmin } = require('../src/middleware/auth');

test('pagination uses bounded defaults and rejects invalid values', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 10, skip: 0 });
  assert.deepEqual(parsePagination({ page: '3', limit: '25' }), {
    page: 3,
    limit: 25,
    skip: 50,
  });

  for (const query of [
    { page: '0' },
    { page: '-1' },
    { page: '1e3' },
    { page: ['1', '2'] },
    { limit: '101' },
    { page: '9007199254740991', limit: '2' },
  ]) {
    assert.equal(parsePagination(query), null);
  }
});

test('schema indexes support the implemented list and aggregation query shapes', () => {
  const hasIndex = (model, expected) => model.schema.indexes().some(([keys]) =>
    Object.entries(expected).every(([field, order]) => keys[field] === order)
  );

  assert(hasIndex(User, { email: 1 }));
  assert(hasIndex(User, { createdAt: -1, _id: -1 }));
  assert(hasIndex(User, { interests: 1 }));
  assert(hasIndex(Note, { owner: 1, createdAt: -1, _id: -1 }));
  assert(hasIndex(Note, { createdAt: -1, _id: -1 }));
  assert(hasIndex(Post, { author: 1, createdAt: -1, _id: -1 }));
});

test('interest grouping is paginated in one aggregation pipeline', () => {
  const pipeline = buildInterestGroupsPipeline({ skip: 10, limit: 5 });
  const facet = pipeline.find((stage) => stage.$facet);

  assert.deepEqual(pipeline[0], { $sort: { interests: 1 } });
  assert(pipeline.some((stage) => stage.$unwind === '$interests'));
  assert(pipeline.some((stage) => stage.$group));
  assert.deepEqual(facet.$facet.data, [{ $skip: 10 }, { $limit: 5 }]);
  assert.deepEqual(facet.$facet.metadata, [{ $count: 'totalItems' }]);
});

test('user post aggregation uses one indexed lookup and paginates its results', () => {
  const pipeline = buildUserPostsPipeline({
    userId: 'user-id',
    postsCollection: 'posts',
    skip: 20,
    limit: 10,
  });
  const lookups = pipeline.filter((stage) => stage.$lookup);
  const lookup = lookups[0].$lookup;
  const facet = lookup.pipeline.find((stage) => stage.$facet);

  assert.equal(lookups.length, 1);
  assert.equal(lookup.from, 'posts');
  assert.equal(lookup.localField, '_id');
  assert.equal(lookup.foreignField, 'author');
  assert.deepEqual(lookup.pipeline[0], { $sort: { createdAt: -1, _id: -1 } });
  assert.deepEqual(facet.$facet.data.slice(0, 2), [{ $skip: 20 }, { $limit: 10 }]);
  assert.deepEqual(facet.$facet.metadata, [{ $count: 'totalItems' }]);
});

test('admin middleware rejects a regular user', () => {
  let statusCode;
  let responseBody;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };

  requireAdmin({ user: { role: 'user' } }, res, () => {
    assert.fail('A regular user must not pass admin authorization');
  });

  assert.equal(statusCode, 403);
  assert.deepEqual(responseBody, { message: 'Admin access required' });
});
