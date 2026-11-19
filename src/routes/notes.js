const express = require('express');
const mongoose = require('mongoose');
const Note = require('../models/Note');
const { requireAuth } = require('../middleware/auth');
const parsePagination = require('../utils/pagination');

const router = express.Router();

function validNoteInput(body, partial) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }

  const allowedFields = ['title', 'content'];
  const fields = Object.keys(body);

  if (
    fields.length === 0 ||
    fields.some((field) => !allowedFields.includes(field)) ||
    (!partial && allowedFields.some((field) => !fields.includes(field)))
  ) {
    return false;
  }

  if (
    fields.includes('title') &&
    (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 160)
  ) {
    return false;
  }
  if (
    fields.includes('content') &&
    (typeof body.content !== 'string' ||
      !body.content.trim() ||
      body.content.length > 20000)
  ) {
    return false;
  }
  return true;
}

function noteFilter(noteId, user) {
  const filter = { _id: noteId };
  if (user.role !== 'admin') {
    filter.owner = user._id;
  }
  return filter;
}

function ownedNoteFilter(noteId, user) {
  return { _id: noteId, owner: user._id };
}

router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    if (!validNoteInput(req.body, false)) {
      return res.status(400).json({ message: 'A valid title and content are required' });
    }
    const note = await Note.create({
      title: req.body.title.trim(),
      content: req.body.content,
      owner: req.user._id,
    });
    res.status(201).json({ note });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const pagination = parsePagination(req.query);
    if (!pagination) {
      return res.status(400).json({ message: 'page and limit must be positive integers; limit cannot exceed 100' });
    }

    const filter = req.user.role === 'admin' ? {} : { owner: req.user._id };
    const [notes, totalItems] = await Promise.all([
      Note.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Note.countDocuments(filter),
    ]);

    res.json({
      notes,
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

router.get('/:noteId', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.noteId)) {
      return res.status(400).json({ message: 'Invalid note id' });
    }

    const note = await Note.findOne(noteFilter(req.params.noteId, req.user));
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.patch('/:noteId', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.noteId)) {
      return res.status(400).json({ message: 'Invalid note id' });
    }
    if (!validNoteInput(req.body, true)) {
      return res.status(400).json({ message: 'Provide a valid title or content to update' });
    }

    const note = await Note.findOne(ownedNoteFilter(req.params.noteId, req.user));
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
      note.title = req.body.title.trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'content')) {
      note.content = req.body.content;
    }
    await note.save();
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

router.delete('/:noteId', async (req, res, next) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.noteId)) {
      return res.status(400).json({ message: 'Invalid note id' });
    }

    const note = await Note.findOneAndDelete(ownedNoteFilter(req.params.noteId, req.user));
    if (!note) {
      return res.status(404).json({ message: 'Note not found' });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
