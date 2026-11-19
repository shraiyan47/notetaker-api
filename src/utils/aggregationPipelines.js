function buildInterestGroupsPipeline({ skip, limit }) {
  return [
    { $sort: { interests: 1 } },
    { $unwind: '$interests' },
    {
      $group: {
        _id: '$interests',
        users: {
          $addToSet: {
            id: '$_id',
            name: '$name',
            email: '$email',
          },
        },
      },
    },
    { $set: { userCount: { $size: '$users' } } },
    { $sort: { _id: 1 } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        metadata: [{ $count: 'totalItems' }],
      },
    },
  ];
}

function buildUserPostsPipeline({ userId, postsCollection, skip, limit }) {
  return [
    { $match: { _id: userId } },
    { $project: { _id: 1, name: 1 } },
    {
      $lookup: {
        from: postsCollection,
        localField: '_id',
        foreignField: 'author',
        pipeline: [
          { $sort: { createdAt: -1, _id: -1 } },
          {
            $facet: {
              data: [
                { $skip: skip },
                { $limit: limit },
                {
                  $project: {
                    _id: 1,
                    title: 1,
                    content: 1,
                    author: 1,
                    createdAt: 1,
                    updatedAt: 1,
                  },
                },
              ],
              metadata: [{ $count: 'totalItems' }],
            },
          },
        ],
        as: 'postResults',
      },
    },
    { $set: { postResult: { $arrayElemAt: ['$postResults', 0] } } },
    {
      $project: {
        _id: 0,
        user: { id: '$_id', name: '$name' },
        posts: { $ifNull: ['$postResult.data', []] },
        totalItems: {
          $ifNull: [
            { $arrayElemAt: ['$postResult.metadata.totalItems', 0] },
            0,
          ],
        },
      },
    },
  ];
}

module.exports = { buildInterestGroupsPipeline, buildUserPostsPipeline };
