import os

import requests
import random

ck = 'crisp-client/session/26d82827-{0}-{1}-bf9a-51794028ef8d=session_d1eab72e-6758-{2}-{3}-da13a13d0152; lang=zh-cn;'
api = 'https://purefast.net'
userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36 Edg/107.0.1418.26'
contentType = 'application/x-www-form-urlencoded; charset=UTF-8'


def signIn(email, passwd):
    # 获取登录页面
    print('账号:%s:开始签到' % email)
    # 获取随机数
    random_value = random.randint(1000, 9999)
    ck.format(random_value, random_value, random_value, random_value)
    headers = {
        'User-Agent': userAgent,
        'content-type': contentType,
        'cookie': ck
    }

    loginData = {
        'email': email,
        'passwd': passwd,
        'code': ''
    }
    # 登录
    response = requests.post(api + '/auth/login', headers=headers, data=loginData)
    resp = response.json()
    print(resp)
    if resp.get('ret') != 1:
        return


    cookies = response.cookies.get_dict()
    cookie = format_cookie(cookies)
    print(cookie)
    headers['cookie'] = cookie
    # 登录到首页
    indexPage = requests.get(api + '/user', headers=headers)
    resp = response.text

    # 直接开始签到
    response = requests.post(api + '/user/checkin', headers=headers)
    print(response.json())
    # 账号退出
    requests.get(api + '/user/logout', headers=headers)
    print('退出当前账号')


def format_cookie(cookies):
    cookie = ''
    for key, value in cookies.items():
        cookie += '%s=%s' % (key, value) + ';'
    return cookie


if __name__ == '__main__':
    pf_accounts = os.getenv("pf_accounts")
    accounts = pf_accounts.split(';')
    for account in accounts:
        if not account:
            continue
        email, passwd = account.split(",")
        signIn(email, passwd)
