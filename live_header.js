let h = $request.headers || {};
h["X-QX-Debug"] = "injected";
h["Referer"] = "https://d.f2d6.co/#/live/512/";
h["User-Agent"] = "Mozilla/5.0";
console.log("QX injected => " + $request.url);
$done({ headers: h });
