function parsePagination(query) {
  const rawPage = query.page === undefined ? '1' : query.page;
  const rawLimit = query.limit === undefined ? '10' : query.limit;

  if (
    typeof rawPage !== 'string' ||
    typeof rawLimit !== 'string' ||
    !/^[1-9]\d*$/.test(rawPage) ||
    !/^[1-9]\d*$/.test(rawLimit)
  ) {
    return null;
  }

  const page = Number(rawPage);
  const limit = Number(rawLimit);
  const skip = (page - 1) * limit;

  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    limit > 100 ||
    !Number.isSafeInteger(skip)
  ) {
    return null;
  }

  return { page, limit, skip };
}

module.exports = parsePagination;
