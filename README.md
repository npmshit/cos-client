# cos-client

腾讯云 COS 客户端

## Install

```javascript
const COSClient = require("@blueshit/cos-client").default;

const client = new COSClient({
  appId: "xxxxx",
  secretId: "xxxxx",
  secretKey: "xxxxx",
  bucket: "test",
  region: "ap-guangzhou",
  prefix: "test/",
});

// 通过 Buffer 上传
const data = fs.readFileSync("icon.png");
client.putObject("icon.png", data)
  .then(console.log)
  .catch(console.log);

// 通过 Stream 上传
const stream = fs.createReadStream("icon.png");
client.putObject("icon.png", stream)
  .then(console.log)
  .catch(console.log);
```
