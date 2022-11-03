import json
import time

import requests

header = {
    'Host': 'mspace.gmmc.com.cn',
    'Authorization': '746f9802e7f83ae08ba9e47948077fdc',
    'Content-Type': 'application/json;charset=utf-8',
    'Origin': 'https://mspace.gmmc.com.cn',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StatusBarHeight/47 BundleId/com.gmmc.myspace BottomBarHeight/34 DSApp/2.3.3',
    'Referer': 'https://mspace.gmmc.com.cn/points/points-task?goindex=1',
    'Content-Length': '162'

}
commentTypeBusinessId = ''

headers = {
    'Authorization': '#',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 StatusBarHeight/47 BundleId/com.gmmc.myspace BottomBarHeight/34 DSApp/2.3.3'
}


# 签到
def sign_in():
    data = {"taskTypeCode": "TASK-INTEGRAL-SIGN-IN", "step": 1, "sign": "#",
            "timestamp": "1667420287820", "appVersion": "2.3.3", "operateSystem": "iOS"}
    result = requests.post('https://mspace.gmmc.com.cn/customer-app/task-mapi/sign-in?noLoad=true', headers=header,
                           data=json.dumps(data))
    if (result.json()['data']['isSignIn']):
        print("成功签到", result.json()['data']['days'], '天')


# 发表帖子
def add_invitation():
    # 获取文案
    content = get_content("http://api.tianapi.com/zaoan/index")
    data = {
        "topicList": [
        ],
        "content": content,
        "btype": 0,
        "backgroundContent": content,
        "area": "水磨沟区",
        "city": "乌鲁木齐市",
        "lat": 43.879204763742784,
        "lng": 87.622172880612723,
        "dynamicFileList": [

        ],
        "province": "新疆维吾尔自治区"
    }
    result = requests.post("https://mspace.gmmc.com.cn/social-cms-app/frontend/dynamic/add", headers=header,
                           data=json.dumps(data))
    print("文章", result.json()['msg'])


# 获取文案
def get_content(url):
    result = requests.get(url + "?key=3080ef73dd95cd96f09e57b54a0a6257")
    return result.json()['newslist'][0]['content']


# 获取需要点赞的文章列表
def get_like_list():
    result = requests.get(
        "https://mspace.gmmc.com.cn/social-cms-app/frontend/dynamic/queryByPage?dimensionType=2&pageNo=1&pageSize=20&type=2",
        headers=headers)
    return result.json()['data']['list']


# 点赞
def like():
    like_list = get_like_list()
    comment_id_list = list(map(lambda x: x['dynamicId'], like_list[0:5]))
    for dynamicId in comment_id_list:
        # 偷个懒 评论最后一篇点赞的文章
        start_like(dynamicId)
        time.sleep(3)


# 开始点赞
def start_like(dynamicId):
    global commentTypeBusinessId
    commentTypeBusinessId = dynamicId
    data = {
        "status": 1,
        "dynamicId": dynamicId
    }
    requests.post("https://mspace.gmmc.com.cn/social-cms-app/frontend/dynamic/liked", headers=header,
                  data=json.dumps(data))
    print("点赞完成")


# 发表评论
def add_comment():
    # 获取评论
    content = get_content("http://api.tianapi.com/caihongpi/index")
    data = {
        "commentTypeBusinessId": commentTypeBusinessId,
        "commentType": 2,
        "commentContent": content
    }
    result = requests.post("https://mspace.gmmc.com.cn/social-cms-app/frontend/comment/add", headers=header,
                           data=json.dumps(data))
    if result.json()['success']:
        print("完成评论")


# 分享动态/咨询
def share():
    data = {
        "taskType": 4
    }
    # 分享动态
    requests.post("https://mspace.gmmc.com.cn/customer-app/integral-task/complete/share?noLoad=true", headers=header,
                  data=json.dumps(data))
    print("分享动态完成")
    time.sleep(3)
    # 分享咨询
    data['taskType'] = 5
    requests.post("https://mspace.gmmc.com.cn/customer-app/integral-task/complete/share?noLoad=true", headers=header,
                  data=json.dumps(data))
    print("分享咨询完成")


if __name__ == '__main__':
    # 发布动态
    add_invitation()
    time.sleep(5)

    # 签到
    sign_in()
    time.sleep(5)

    # 点赞内容
    like()
    time.sleep(30)
    # 评论
    add_comment()

    # 分享动态/咨询
    time.sleep(10)
    share()
