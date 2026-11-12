// Chrome is needed only by the sync job (GitHub Actions / local), never on Vercel.
module.exports = { skipDownload: !!process.env.VERCEL };
