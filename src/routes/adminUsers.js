const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const parsePagination = require('../utils/pagination');
const { buildInterestGroupsPipeline } = require('../utils/aggregationPipelines');

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_FIELDS = ['name', 'email', 'password', 'role', 'interests'];

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    interests: user.interests,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function normalizeInterests(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    return null;
  }
  return [...new Set(value.map((item) => item.trim().toLowerCase()).filter(Boolean))];
}

function validUserInput(body, partial) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const fields = Object.keys(body);
  if (
    fields.length === 0 ||
    fields.some((field) => !USER_FIELDS.includes(field)) ||
    (!partial && ['name', 'email', 'password'].some((field) => !fields.includes(field)))
  ) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'name') &&
    (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80)
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'email') &&
    (typeof body.email !== 'string' ||
      body.email.trim().length > 254 ||
      !EMAIL_PATTERN.test(body.email.trim()))
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'password') &&
    (typeof body.password !== 'string' ||
      body.password.length < 8 ||
      Buffer.byteLength(body.password, 'utf8') > 72)
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'role') &&
    !['user', 'admin'].includes(body.role)
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(body, 'interests') &&
    normalizeInterests(body.interests) === null
  ) {
    return false;
  }
  return true;
}

router.use(requireAuth, requireAdmin); // All routes in this router require authentication and admin role

router.post('/', async (req, res, next) => {
  try {
    if (!validUserInput(req.body, false)) {
      return res.status(400).json({ message: 'Invalid user details' });
    }

    const user = await User.create({
      name: req.body.name.trim(),
      email: req.body.email.trim().toLowerCase(),
      password: req.body.password,
      role: req.body.role || 'user',
      interests: req.body.interests === undefined ? [] : normalizeInterests(req.body.interests),
    });
    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ message: 'page and limit must be positive integers; limit cannot exceed 100' });
    }

    const [users, totalItems] = await Promise.all([
      User.find()
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      User.countDocuments(),
    ]);

    res.json({
      users: users.map(publicUser),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / pagination.limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/grouped-by-interests', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ message: 'page and limit must be positive integers; limit cannot exceed 100' });
    }

    const [result] = await User.aggregate(
      buildInterestGroupsPipeline({
        skip: pagination.skip,
        limit: pagination.limit,
      })
    );
    const totalItems = result.metadata[0] ? result.metadata[0].totalItems : 0;

    res.json({
      groups: result.data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / pagination.limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:userId', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (!validUserInput(req.body, true)) {
      return res.status(400).json({ message: 'Invalid user details' });
    }
    if (req.params.userId === req.user._id.toString() && req.body.role === 'user') {
      return res.status(400).json({ message: 'You cannot remove your own admin role' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    for (const field of Object.keys(req.body)) {
      if (field === 'email') {
        user.email = req.body.email.trim().toLowerCase();
      } else if (field === 'name') {
        user.name = req.body.name.trim();
      } else if (field === 'interests') {
        user.interests = normalizeInterests(req.body.interests);
      } else {
        user[field] = req.body[field];
      }
    }

    await user.save();
    res.json({ user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Email is already registered' });
    }
    next(err);
  }
});

router.delete('/:userId', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    await Promise.all([
      Note.deleteMany({ owner: user._id }),
      Post.deleteMany({ author: user._id }),
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
