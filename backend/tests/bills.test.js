import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Purchase } from '../src/models/index.js';
import {
  buildApp,
  createTestCustomer,
  loginAsAdmin,
  loginAsCustomer,
  samplePurchase,
  useTestDatabase,
} from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

// Minimal files with the real magic bytes of each accepted format.
const PDF = () => Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const GIF = () => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32, 3)]);
const WEBP = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const HEIC = () => Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(16)]);
const zipWith = (entry) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(entry), Buffer.alloc(32, 4)]);
const DOCX = () => zipWith('word/document.xml');
const XLSX = () => zipWith('xl/workbook.xml');
const OLE = () => Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64, 5)]);

const binary = (res, callback) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
};

let adminAuth;
let rohit;
let purchaseId;

beforeEach(async () => {
  // GridFS collections are not Mongoose models, so the shared cleanup doesn't cover them.
  await mongoose.connection.db.collection('bills.files').deleteMany({});
  await mongoose.connection.db.collection('bills.chunks').deleteMany({});

  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
  const created = await api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(samplePurchase(rohit._id)).expect(201);
  purchaseId = created.body.data.purchase.id;
});

const billFilesCount = () => mongoose.connection.db.collection('bills.files').countDocuments();

const upload = (id, body, filename = 'bill.pdf', auth = adminAuth) => {
  let req = api().post(`/api/v1/admin/purchases/${id}/bill`).query({ filename });
  if (auth) req = req.set('Authorization', auth);
  return req.set('Content-Type', 'application/octet-stream').send(body);
};
const downloadAsAdmin = (id = purchaseId) =>
  api().get(`/api/v1/admin/purchases/${id}/bill`).set('Authorization', adminAuth).buffer(true).parse(binary);

describe('Upload a bill', () => {
  it('stores a PDF, exposes only metadata, and the admin can download the identical bytes', async () => {
    const file = PDF();
    const res = await upload(purchaseId, file, 'Samsung S25 bill.pdf').expect(200);

    expect(res.body.data.purchase.bill).toMatchObject({
      filename: 'Samsung S25 bill.pdf',
      contentType: 'application/pdf',
      size: file.length,
    });
    expect(res.body.data.purchase.bill).not.toHaveProperty('fileId');
    expect(await billFilesCount()).toBe(1);

    const download = await downloadAsAdmin().expect(200);
    expect(Buffer.compare(download.body, file)).toBe(0);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['content-disposition']).toMatch(/^attachment; filename="Samsung S25 bill\.pdf"/);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['cache-control']).toBe('private, no-store');
    expect(Number(download.headers['content-length'])).toBe(file.length);
  });

  it.each([
    ['PNG', PNG, 'bill.png', 'image/png'],
    ['JPEG', JPG, 'photo.jpg', 'image/jpeg'],
    ['GIF', GIF, 'scan.gif', 'image/gif'],
    ['WebP', WEBP, 'scan.webp', 'image/webp'],
    ['HEIC', HEIC, 'IMG_0042.heic', 'image/heic'],
    ['Word (docx)', DOCX, 'invoice.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['Word (doc)', OLE, 'invoice.doc', 'application/msword'],
    ['Excel (xlsx)', XLSX, 'sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['Excel (xls)', OLE, 'sheet.xls', 'application/vnd.ms-excel'],
  ])('accepts %s', async (_label, makeFile, filename, mime) => {
    const res = await upload(purchaseId, makeFile(), filename).expect(200);
    expect(res.body.data.purchase.bill).toMatchObject({ filename, contentType: mime });
  });

  it('trusts the file contents, not the name: the stored type and extension follow the real format', async () => {
    const res = await upload(purchaseId, PNG(), 'receipt.pdf').expect(200);
    expect(res.body.data.purchase.bill).toMatchObject({ filename: 'receipt.png', contentType: 'image/png' });
  });

  it('shows the bill in purchase lists and the customer view', async () => {
    await upload(purchaseId, PDF()).expect(200);
    const list = await api().get('/api/v1/admin/purchases').set('Authorization', adminAuth).expect(200);
    expect(list.body.data.items[0].bill).toMatchObject({ filename: 'bill.pdf' });

    const { auth } = await loginAsCustomer(app, '9876543210');
    const mine = await api().get(`/api/v1/customer/purchases/${purchaseId}`).set('Authorization', auth).expect(200);
    expect(mine.body.data.purchase.bill).toMatchObject({ filename: 'bill.pdf', contentType: 'application/pdf' });
  });

  it('a purchase without a bill reports bill: null', async () => {
    const res = await api().get(`/api/v1/admin/purchases/${purchaseId}`).set('Authorization', adminAuth).expect(200);
    expect(res.body.data.purchase.bill).toBeNull();
  });
});

describe('Rejected uploads', () => {
  it.each([
    ['an executable renamed to .pdf', Buffer.from('MZ\x90\x00\x03\x00\x00\x00 fake executable'), 'bill.pdf'],
    ['an HTML page named .png', Buffer.from('<html><script>alert(1)</script></html>'), 'bill.png'],
    ['an SVG image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'bill.svg'],
    ['plain text', Buffer.from('just some text'), 'bill.txt'],
    ['an OLE file that is not doc/xls', OLE(), 'presentation.ppt'],
    ['a generic zip archive', zipWith('readme.txt'), 'bill.docx'],
  ])('refuses %s', async (_label, body, filename) => {
    const res = await upload(purchaseId, body, filename).expect(422);
    expect(res.body.message).toBe('Unsupported file type');
    expect(res.body.errors[0].message).toMatch(/PDF, image/);
    expect(await billFilesCount()).toBe(0);
    expect((await Purchase.findById(purchaseId)).bill.fileId).toBeUndefined();
  });

  it('refuses an empty upload', async () => {
    await upload(purchaseId, Buffer.alloc(0)).expect(422);
    await api().post(`/api/v1/admin/purchases/${purchaseId}/bill`).set('Authorization', adminAuth).expect(422);
  });

  it('refuses files over 10 MB', async () => {
    const big = Buffer.concat([PDF(), Buffer.alloc(10 * 1024 * 1024 + 10, 0x20)]);
    const res = await upload(purchaseId, big).expect(413);
    expect(res.body.message).toMatch(/Maximum size is 10 MB/);
    expect(await billFilesCount()).toBe(0);
  });

  it('accepts a file just under the limit', async () => {
    const nearLimit = Buffer.concat([PDF(), Buffer.alloc(9 * 1024 * 1024, 0x20)]);
    await upload(purchaseId, nearLimit).expect(200);
  });

  it('returns 404 for unknown purchases', async () => {
    await upload('64b7f0000000000000000000', PDF()).expect(404);
    await upload('not-an-id', PDF()).expect(404);
    expect(await billFilesCount()).toBe(0);
  });
});

describe('File names', () => {
  it('strips path components and control characters', async () => {
    const res = await upload(purchaseId, PDF(), '..\\..\\etc/pass<>wd\u0007.pdf').expect(200);
    expect(res.body.data.purchase.bill.filename).toBe('passwd.pdf');
  });

  it('keeps non-ASCII names and offers an ASCII fallback for downloads', async () => {
    await upload(purchaseId, PDF(), 'बिल रसीद.pdf').expect(200);
    const download = await downloadAsAdmin().expect(200);
    expect(download.headers['content-disposition']).toContain(`filename*=UTF-8''${encodeURIComponent('बिल रसीद.pdf')}`);
    expect(download.headers['content-disposition']).toMatch(/filename="[\x20-\x7e]+"/);
  });

  it('falls back to "bill" when no name is provided', async () => {
    const res = await api()
      .post(`/api/v1/admin/purchases/${purchaseId}/bill`)
      .set('Authorization', adminAuth)
      .set('Content-Type', 'application/octet-stream')
      .send(PDF())
      .expect(200);
    expect(res.body.data.purchase.bill.filename).toBe('bill.pdf');
  });
});

describe('Replace and remove', () => {
  it('replacing a bill deletes the previous file', async () => {
    await upload(purchaseId, PDF(), 'first.pdf').expect(200);
    const second = PNG();
    await upload(purchaseId, second, 'second.png').expect(200);

    expect(await billFilesCount()).toBe(1);
    const download = await downloadAsAdmin().expect(200);
    expect(Buffer.compare(download.body, second)).toBe(0);
    expect(download.headers['content-type']).toBe('image/png');
  });

  it('removes a bill, its file and its download', async () => {
    await upload(purchaseId, PDF()).expect(200);
    const res = await api().delete(`/api/v1/admin/purchases/${purchaseId}/bill`).set('Authorization', adminAuth).expect(200);
    expect(res.body.data.purchase.bill).toBeNull();
    expect(await billFilesCount()).toBe(0);
    await downloadAsAdmin().expect(404);
    await api().delete(`/api/v1/admin/purchases/${purchaseId}/bill`).set('Authorization', adminAuth).expect(404);
  });

  it('cancelled purchases keep their bill but cannot be changed', async () => {
    await upload(purchaseId, PDF()).expect(200);
    await api().post(`/api/v1/admin/purchases/${purchaseId}/cancel`).set('Authorization', adminAuth).send({}).expect(200);

    await upload(purchaseId, PNG(), 'other.png').expect(409);
    await api().delete(`/api/v1/admin/purchases/${purchaseId}/bill`).set('Authorization', adminAuth).expect(409);
    expect(await billFilesCount()).toBe(1);
    await downloadAsAdmin().expect(200);
  });

  it('cannot attach a bill to an already cancelled purchase', async () => {
    await api().post(`/api/v1/admin/purchases/${purchaseId}/cancel`).set('Authorization', adminAuth).send({}).expect(200);
    await upload(purchaseId, PDF()).expect(409);
    expect(await billFilesCount()).toBe(0);
  });
});

describe('Access control', () => {
  it('customer downloads the bill of their own purchase', async () => {
    const file = PDF();
    await upload(purchaseId, file, 'Rohit bill.pdf').expect(200);
    const { auth } = await loginAsCustomer(app, '9876543210');

    const res = await api().get(`/api/v1/customer/purchases/${purchaseId}/bill`).set('Authorization', auth).buffer(true).parse(binary).expect(200);
    expect(Buffer.compare(res.body, file)).toBe(0);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Rohit bill\.pdf"/);
  });

  it("a customer cannot download another customer's bill (404, same as a missing purchase)", async () => {
    await upload(purchaseId, PDF()).expect(200);
    await createTestCustomer({ name: 'Priya Mehta', mobile: '+919823456789' });
    const { auth: priyaAuth } = await loginAsCustomer(app, '9823456789');

    const other = await api().get(`/api/v1/customer/purchases/${purchaseId}/bill`).set('Authorization', priyaAuth).expect(404);
    const missing = await api().get('/api/v1/customer/purchases/64b7f0000000000000000000/bill').set('Authorization', priyaAuth).expect(404);
    expect(other.body).toEqual(missing.body);
  });

  it('a purchase without a bill returns 404 to the customer', async () => {
    const { auth } = await loginAsCustomer(app, '9876543210');
    const res = await api().get(`/api/v1/customer/purchases/${purchaseId}/bill`).set('Authorization', auth).expect(404);
    expect(res.body.message).toMatch(/no bill/i);
  });

  it('requires authentication, and customers cannot use the admin bill endpoints', async () => {
    await upload(purchaseId, PDF()).expect(200);
    await upload(purchaseId, PDF(), 'bill.pdf', null).expect(401);
    await api().get(`/api/v1/admin/purchases/${purchaseId}/bill`).expect(401);
    await api().get(`/api/v1/customer/purchases/${purchaseId}/bill`).expect(401);

    const { auth: customerAuth } = await loginAsCustomer(app, '9876543210');
    await upload(purchaseId, PDF(), 'bill.pdf', customerAuth).expect(401);
    await api().get(`/api/v1/admin/purchases/${purchaseId}/bill`).set('Authorization', customerAuth).expect(401);
    await api().delete(`/api/v1/admin/purchases/${purchaseId}/bill`).set('Authorization', customerAuth).expect(401);
  });
});
