const express = require('express');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const parsePagination = require('../utils/pagination');
const { buildUserPostsPipeline } = require('../utils/aggregationPipelines');

const router = express.Router();

function validPostInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const fields = Object.keys(body);
  return (
    fields.length === 2 &&
    fields.includes('title') &&
    fields.includes('content') &&
    typeof body.title === 'string' &&
    Boolean(body.title.trim()) &&
    body.title.trim().length <= 160 &&
    typeof body.content === 'string' &&
    Boolean(body.content.trim()) &&
    body.content.length <= 20000
  );
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    if (!validPostInput(req.body)) {
      return res.status(400).json({ message: 'A valid title and content are required' });
    }

    const post = await Post.create({
      title: req.body.title.trim(),
      content: req.body.content,
      author: req.user._id,
    });
    res.status(201).json({ post });
  } catch (err) {
    next(err);
  }
});

router.patch('/:postId', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post id' });
    }

    const { title, content } = req.body || {};
    const update = {};
    if (typeof title === 'string' && title.trim() && title.trim().length <= 160) {
      update.title = title.trim();
    }
    if (typeof content === 'string' && content.trim() && content.length <= 20000) {
      update.content = content;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: 'Provide a valid title or content to update' });
    }

    const post = await Post.findOneAndUpdate(
      { _id: req.params.postId, author: req.user._id },
      { $set: update },
      { new: true }
    );
    if (!post) {
      return res.status(404).json({ message: 'Post not found or not yours to edit' });
    }
    res.json({ post });
  } catch (err) {
    next(err);
  }
});

router.delete('/:postId', requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.postId)) {
      return res.status(400).json({ message: 'Invalid post id' });
    }

    const filter = { _id: req.params.postId };
    if (req.user.role !== 'admin') {
      filter.author = req.user._id;
    }

    const post = await Post.findOneAndDelete(filter);
    if (!post) {
      return res.status(404).json({ message: 'Post not found or not yours to delete' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/by-user/:userId', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ message: 'page and limit must be positive integers; limit cannot exceed 100' });
    }

    const [result] = await User.aggregate(
      buildUserPostsPipeline({
        userId: new mongoose.Types.ObjectId(req.params.userId),
        postsCollection: Post.collection.name,
        skip: pagination.skip,
        limit: pagination.limit,
      })
    );

    if (!result) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: result.user,
      posts: result.posts,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pagination.limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
