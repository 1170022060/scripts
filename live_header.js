const headers = $request.headers || {};
headers["Referer"] = "https://d.f2d6.co/#/live/512/";
headers["User-Agent"] = "Mozilla/5.0";
$done({ headers });