# jellyfin折腾直链

> **记录一下这条折腾jellyfin网盘直链的操作**

### 更新内容

首先参考了 

[emby挂载阿里盘转直链 | blog](https://blog.738888.xyz/2021/09/06/emby%E6%8C%82%E8%BD%BD%E9%98%BF%E9%87%8C%E7%9B%98%E8%BD%AC%E7%9B%B4%E9%93%BE/)

这位博主的教程，本来按照他的教程应该是一切ok，但是在使用的时候发现**jellyfin**的兼容并不完整，所以对其代码做了修改，这里也记录一下。在此感谢这位大佬。

先说一下我修改的部分：

- 增加userid（**jellyfin必须用到，不然api会报错**）
- `fetchEmbyFilePath` 方法修改为`GET` 请求，`POST`请求会失败
- `alist`挂载按照代码中的配置，必须为根目录，不然替换路径会有问题

遗留问题：

- 网页版本的`jellyfin`获取图片显示有问题，目前没有找到解决办法
- 链接里面会自带一个`api_key`实测请求没问题，所以没有做替换，怀疑是`jellfin`内置的

总体来说效果还是挺好，然后我自己是关闭了服务器转码，所以都是用客户端解码，暂时也不受图片问题的影响

代码只修改了`emby.js` 里面需要修改的是`userid`，这个可以在你登录网页之后获取到。

**路径：**

登录，点击用户图标，然后点击简介，地址栏就会有。参照：

![userid](https://github.com/kikohz/jellyfin-link/raw/main/Screen%20Shot1.png)

`embyMountPath` 按照注释填写即可

最后在此提醒 `alist`需要挂在根目录：

![alist](https://github.com/kikohz/jellyfin-link/raw/main/Screen%20Shot2.png)

### 最后安装步骤：

1. 下载配置文件到VPS

   ```bash
   wget https://objectstorage.ap-seoul-1.oraclecloud.com/n/cno3iavztv8w/b/mybox/o/embyAlist.tar && mkdir -p ~/embyAlist && tar -xvf ./embyAlist.tar -C ~/embyAlist && cd ~/embyAlist
   ```

2. 按照上面来修改`emby.js`配置

   alist密码根据自己的配置来修改，默认是空，另外保证你的`jellyfin`服务端口为`8096`，不然自行修改`emby.js`和`emby.conf`中的配置

3. 启动服务，在 `~/embyAlist` 目录下执行

   ```bash
   docker-compose up -d
   ```

   查看启动日志：

   ```bash
   docker-compose logs -f
   ```

4. 防火墙需要放行 5244, 8095，8095端口为`jellyfin`转直链端口与默认的8096互不影响

5. 访问alist后台来挂载网盘

   访问5244端口,**初始密码**查看`docker log`能看到 ,根据项目文档 [https://github.com/Xhofe/alist](https://github.com/Xhofe/alist)
    在Alist项目后台添加网盘

6. 访问8095端口来测试直链是否生效，查看log

   ```jsx
   docker logs -f -n 10 emby-nginx 2>&1  | grep js:
   ```

8095端口为走直链端口 , 原本的 8096端口 走 `jellyfin server` 不变

直链播放不支持转码,转码的话只能走`jellyfin` `server`

所以最好 在`jellyfin`设置中将关闭转码功能
