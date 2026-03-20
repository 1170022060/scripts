let headers = $request.headers || {};

headers["Referer"] = "https://d.f2d6.co/#/live/512/";
headers["referer"] = "https://d.f2d6.co/#/live/512/";
headers["User-Agent"] = "Mozilla/5.0";
headers["user-agent"] = "Mozilla/5.0";

console.log("QX header injected => " + $request.url);
$done({ headers });
