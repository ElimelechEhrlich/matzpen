// Prints a new MASTER_KEY. Put the same value in Vercel and in GitHub Actions secrets.
import { randomBytes } from 'node:crypto';
console.log(randomBytes(32).toString('base64'));
