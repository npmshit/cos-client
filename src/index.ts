/**
 * @file COS Client
 * @author Yourtion Guo <yourtion@gmail.com>
 */

import assert from "assert";
import crypto from "crypto";
import http, { Agent } from "http";
import https, { RequestOptions } from "https";
import { Readable } from "stream";
import { extname } from "path";
import { getType } from "mime";

export interface IOption {
  /** APPID */
  appId: string;
  /** 秘钥ID */
  secretId: string;
  /** 秘钥Key */
  secretKey: string;
  /** Bucket */
  bucket: string;
  /** 地址 */
  region: string;
  /** 前缀 */
  prefix?: string;
  /** 自定义访问地址 */
  cdn?: string;
  /** HTTP Agent */
  agent?: Agent;
}

export interface IPutOption {
  /** contentType */
  type?: string;
  /** 文件名（用于计算contentType） */
  name?: string;
  /** 文件md5 */
  md5?: string;
}

export type METHOD = "PUT" | "GET" | "POST" | "HEAD" | "DELETE";

export interface IHeader {
  [header: string]: number | string | string[] | undefined;
}

export interface IReply {
  code: number;
  headers: IHeader;
  buffer?: Buffer;
  body?: string;
}

interface IAuth {
  method: string;
  key: string;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  expires?: number;
}

function camSafeUrlEncode(str: string) {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");
}

function getObjectInfo(obj: Record<string, any> = {}) {
  const list = [];
  const keys = [];
  const objKeys = Object.keys(obj)
    .map((k) => [k, k.toLowerCase()])
    .sort((a, b) => {
      return a[1] === b[1] ? 0 : a[1] > b[1] ? 1 : -1;
    });
  for (const [k, kl] of objKeys) {
    const key = camSafeUrlEncode(kl);
    const v = obj[k] === undefined || obj[k] === null ? "" : "" + obj[k];
    const val = camSafeUrlEncode(v);
    keys.push(key);
    list.push(key + "=" + val);
  }
  return [keys, list];
}

const SIGN_ALGO = "sha1";

export default class COSClient {
  private appId: string;
  private secretId: string;
  private secretKey: string;
  private bucket: string;
  private region: string;
  private prefix?: string;
  private cdn: string;
  private agent?: Agent;

  constructor(options: IOption) {
    assert(typeof options.appId === "string" && options.appId, "请配置 AppId");
    assert(typeof options.secretId === "string" && options.secretId, "请配置 SecretId");
    assert(typeof options.secretKey === "string" && options.secretKey, "请配置 SecretKey");
    assert(typeof options.bucket === "string" && options.bucket, "请配置 bucket");
    assert(typeof options.region === "string" && options.region, "请配置 region");
    if (options.cdn) {
      assert(
        /^((^https?:)?(?:\/\/)?)([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}$/.test(options.cdn),
        "cdn必须配置url(最后不需要 `/`)"
      );
    }
    this.appId = options.appId;
    this.secretId = options.secretId;
    this.secretKey = options.secretKey;
    this.bucket = options.bucket;
    this.region = options.region;
    this.prefix = options.prefix;
    this.cdn = options.cdn || `http://${this.bucket}-${this.appId}.cos.${this.region}.myqcloud.com`;
    this.agent = options.agent;
  }

  private getAuth(opts: IAuth) {
    const now = Math.round(Date.now() / 1000) - 1;
    const exp = opts.expires || now + 900;
    const method = opts.method.toLowerCase();
    const queryParams = { ...opts.query };
    const headers = { ...opts.headers };
    // 要用到的 Authorization 参数列表
    const qAk = this.secretId;
    const qSignTime = now + ";" + exp;
    const qKeyTime = qSignTime;
    const pathname = opts.key[0] !== "/" ? "/" + opts.key : opts.key;
    const [qHk, qHl] = getObjectInfo(headers);
    const [qUk, qUl] = getObjectInfo(queryParams);
    const qHeaderList = qHk.join(";");
    const qUrlParamList = qUk.join(";");

    // 签名算法说明文档：https://www.qcloud.com/document/product/436/7778
    // 步骤一：计算 SignKey
    const signKey = crypto.createHmac(SIGN_ALGO, this.secretKey).update(qKeyTime).digest("hex");
    // 步骤二：构成 FormatString
    const formatString = [method, pathname, qUl.join("&"), qHl.join("&"), ""].join("\n");
    // 步骤三：计算 StringToSign
    const res = crypto.createHash(SIGN_ALGO).update(formatString).digest("hex");
    const stringToSign = [SIGN_ALGO, qSignTime, res, ""].join("\n");
    // 步骤四：计算 Signature
    const qSignature = crypto.createHmac(SIGN_ALGO, signKey).update(stringToSign).digest("hex");
    // 步骤五：构造 Authorization
    const authorization = [
      `q-sign-algorithm=${SIGN_ALGO}`,
      `q-ak=${qAk}`,
      `q-sign-time=${qSignTime}`,
      `q-key-time=${qKeyTime}`,
      `q-header-list=${qHeaderList}`,
      `q-url-param-list=${qUrlParamList}`,
      `q-signature=${qSignature}`,
    ].join("&");
    return authorization;
  }

  private getFileKey(key: string) {
    const res = this.prefix ? this.prefix + key : key;
    return res.replace(/^\/+/, "");
  }

  private request(params: RequestOptions, data?: Buffer | Readable, raw = false): Promise<IReply> {
    return new Promise((resolve, reject) => {
      const req = http.request(params, (response) => {
        const buffers: any[] = [];
        response.on("data", (chunk) => buffers.push(chunk));
        response.on("end", () => {
          const buf = Buffer.concat(buffers);
          return resolve({
            code: response.statusCode || -1,
            headers: response.headers,
            buffer: buf,
            body: raw ? "" : buf.toString("utf8"),
          });
        });
        response.on("error", (err) => reject(err));
      });
      req.on("error", (err) => reject(err));
      if (Buffer.isBuffer(data)) {
        req.end(data);
      } else if (data && typeof data.pipe === "function") {
        data.pipe(req);
      } else {
        req.end();
      }
    });
  }

  private requestObject(method: METHOD, key: string, data?: Buffer | Readable, raw = false, options: IPutOption = {}) {
    const date = new Date().toUTCString();
    const filekey = this.getFileKey(key);
    const ext = extname(options.name || filekey);
    const type = (method === "POST" || method === "PUT") && ext ? getType(ext.replace(".", "")) : options.type || "";
    const hostname = `${this.bucket}-${this.appId}.cos.${this.region}.myqcloud.com`;
    const headers = {
      Host: hostname,
      Date: date,
      "Content-Type": type || "",
    } as Record<string, any>;
    const auth = this.getAuth({ method, key: filekey, headers });
    headers["Authorization"] = auth;
    const option = {
      hostname,
      path: encodeURI(`/${filekey}`),
      method: method,
      headers,
      agent: this.agent,
    };
    return this.request(option, data, raw);
  }

  putObject(key: string, data: Buffer | Readable, options?: IPutOption) {
    return this.requestObject("PUT", key, data, false, options);
  }

  getObject(key: string) {
    return this.requestObject("GET", key, undefined, true);
  }

  deleteObject(key: string) {
    return this.requestObject("DELETE", key);
  }

  objectMeta(key: string) {
    return this.requestObject("HEAD", key);
  }

  headObject(key: string) {
    return this.requestObject("HEAD", key);
  }

  getSignUrl(key: string, ttl = 60) {
    const expires = Math.round(Date.now() / 1000) + ttl;
    const filekey = this.getFileKey(key);
    const auth = this.getAuth({ method: "GET", key: filekey, expires });
    return `${this.cdn}/${filekey}?${auth}`;
  }

  putObjectWithUrl(key: string, url: string, options?: IPutOption): Promise<string> {
    return new Promise((resolve) => {
      (url.indexOf("https") === 0 ? https : http).get(url, async (res) => {
        await this.putObject(key, res, options);
        resolve(this.getSignUrl(key));
      });
    });
  }
}
