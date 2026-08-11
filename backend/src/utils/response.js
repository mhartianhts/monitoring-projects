export const ok = (res, data, status = 200) => {
  return res.status(status).json({ success: true, data });
};

export const fail = (res, message, status = 400, extra = undefined) => {
  const body = { success: false, error: message };
  if (extra !== undefined) body.data = extra;
  return res.status(status).json(body);
};

export const badRequest = (res, message = "Bad Request") => {
  return fail(res, message, 400);
};
