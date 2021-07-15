import COSClient from "./index";
import http from "http";
import https from "https";

const appId = process.env.TEST_COS_APPID!;
const secretId = process.env.TEST_COS_ID!;
const secretKey = process.env.TEST_COS_KEY!;
const bucket = process.env.TEST_COS_BUCKET!;
const region = process.env.TEST_COS_REGION!;
const prefix = process.env.TEST_COS_PREFEX!;

const config = { appId, secretId, secretKey, bucket, region, prefix };
const client = new COSClient(config);

const clientWithAgent = new COSClient({
  ...config,
  cdn: `https://${bucket}-${appId}.cos.${region}.myqcloud.com`,
  agent: new http.Agent({ keepAlive: true, keepAliveMsecs: 10000 }),
});

const TEST_KEY = "COSClient.data";
const TEST_DATA = Date.now() + "";
const TEST_URL = "http://mat1.gtimg.com/pingjs/ext2020/qqindex2018/dist/img/qq_logo_2x.png";

function getFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    return (url.indexOf("https") === 0 ? https : http).get(url, (res) => {
      const buffers: any[] = [];
      res.on("data", (chunk) => buffers.push(chunk));
      res.on("end", () => resolve(Buffer.concat(buffers)));
      res.on("error", (err) => reject(err));
    });
  });
}

describe("COSClient", function () {
  const SHARE: any = {};

  beforeAll(async () => {
    await client.deleteObject(TEST_KEY);
  });

  test("putObject", async () => {
    const ret = await client.putObject(TEST_KEY, Buffer.from(TEST_DATA));
    expect(ret.code).toBe(200);
    expect(ret.headers.etag).toBeDefined();
    expect(ret.headers["x-cos-hash-crc64ecma"]).toBeDefined();
    expect(ret.headers["etag"]).toBeDefined();
    SHARE.headers = ret.headers;
    SHARE.md5 = ret.headers["etag"];
  });

  test("objectMeta", async () => {
    const ret = await client.objectMeta(TEST_KEY);
    expect(ret.code).toBe(200);
    expect(ret.headers.etag).toEqual(SHARE.headers.etag);
    expect(ret.headers["x-cos-hash-crc64ecma"]).toEqual(SHARE.headers["x-cos-hash-crc64ecma"]);
    SHARE.headers = ret.headers;
  });

  test("objectMeta With Agent", async () => {
    const ret = await clientWithAgent.objectMeta(TEST_KEY);
    expect(ret.code).toBe(200);
    expect(ret.headers.etag).toEqual(SHARE.headers.etag);
    expect(ret.headers["x-cos-hash-crc64ecma"]).toEqual(SHARE.headers["x-cos-hash-crc64ecma"]);
    SHARE.headers = ret.headers;
  });

  test("headObject", async () => {
    const ret = await client.headObject(TEST_KEY);
    expect(ret.code).toBe(200);
    expect(ret.headers.etag).toEqual(SHARE.headers.etag);
    expect(ret.headers["last-modified"]).toEqual(SHARE.headers["last-modified"]);
    expect(ret.headers["x-cos-hash-crc64ecma"]).toEqual(SHARE.headers["x-cos-hash-crc64ecma"]);
    expect(ret.headers["etag"]).toEqual(SHARE.md5);
    SHARE.headers = ret.headers;
  });

  test("getObject", async () => {
    const ret = await client.getObject(TEST_KEY);
    expect(ret.code).toBe(200);
    expect(ret.headers.etag).toEqual(SHARE.headers.etag);
    expect(ret.headers["x-cos-hash-crc64ecma"]).toEqual(SHARE.headers["x-cos-hash-crc64ecma"]);
    expect(ret.headers["etag"]).toEqual(SHARE.md5);
    expect(ret.buffer!.toString()).toEqual(TEST_DATA);
  });

  test("getObject With Agent", async () => {
    const ret = await clientWithAgent.getObject(TEST_KEY);
    expect(ret.code).toBe(200);
    expect(ret.headers.etag).toEqual(SHARE.headers.etag);
    expect(ret.headers["x-cos-hash-crc64ecma"]).toEqual(SHARE.headers["x-cos-hash-crc64ecma"]);
    expect(ret.headers["etag"]).toEqual(SHARE.md5);
    expect(ret.buffer!.toString()).toEqual(TEST_DATA);
  });

  test("getSignUrl", async () => {
    const url = client.getSignUrl(TEST_KEY);
    const ret = await getFile(url);
    expect(ret.toString()).toEqual(TEST_DATA);
  });

  test("deleteObject", async () => {
    const ret = await client.deleteObject(TEST_KEY);
    expect(ret.code).toBe(204);
    const ret2 = await client.headObject(TEST_KEY);
    expect(ret2.code).toBe(404);
  });

  test("putObjectWithUrl", async () => {
    const url = await client.putObjectWithUrl(TEST_KEY, TEST_URL);
    const org = await getFile(url);
    const dis = await getFile(TEST_URL);
    expect(dis).toEqual(org);
  });

  describe("fix", function () {
    test("fix: get key with multi-///", () => {
      (client as any).prefix = undefined;
      const key = (client as any).getFileKey("//aa/a");
      expect(key).toEqual("aa/a");
      (client as any).prefix = process.env.TEST_COS_PREFEX;
    });
  
    test("fix: key with space", async () => {
      const KEY = "COS Client.data";
      const ret = await clientWithAgent.putObject(KEY, Buffer.from(TEST_DATA));
      expect(ret.code).toBe(200);
      expect(ret.headers.etag).toBeDefined();
      expect(ret.headers["x-cos-hash-crc64ecma"]).toBeDefined();
      expect(ret.headers["etag"]).toBeDefined();
      const ret2 = await clientWithAgent.deleteObject(KEY);
      expect(ret2.code).toBe(204);
      const ret3 = await clientWithAgent.headObject(KEY);
      expect(ret3.code).toBe(404);
    });
  });
});

