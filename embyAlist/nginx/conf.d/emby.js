//查看日志: "docker logs -f -n 10 emby-nginx 2>&1  | grep js:"
async function redirect2Pan(r) {
    //根据实际情况修改下面4个设置
    const embyHost = 'http://172.17.0.1:8096'; //这里默认emby/jellyfin的地址是宿主机,要注意iptables给容器放行端口
    const embyMountPath = '/home';  // rclone 的挂载目录, 通过df -h 查看例如将od, gd挂载到/mnt目录下:  /mnt/onedrive  /mnt/gd ,那么这里 就填写 /mnt
    const alistPwd = '';      //alist password
    const alistAddr = 'http://172.17.0.1:5244'; //访问宿主机上5244端口的alist api, 要注意iptables给容 器放行端口
    const embyApiKey = '6ceb72bebf034b898'

    //fetch mount emby/jellyfin file path
    const regex = /[A-Za-z0-9]+/g;
    const itemId = r.uri.replace('emby', '').replace(/-/g, '').match(regex)[1];
    const mediaSourceId =  r.args.MediaSourceId ? r.args.MediaSourceId : r.args.mediaSourceId;
    let api_key = r.args['X-Emby-Token'] ? r.args['X-Emby-Token'] : r.args.api_key;
    api_key = api_key ? api_key : embyApiKey;

    // jellyfin 必须要用到userid，不然接口会报错，这里用固定的一个id只是用于获取剧集信息，不会影响用户其他信息
    const userId = '000b9695c0824bdba'

    //请求jellyfin接口来获取item的信息
    const itemInfoUri = `${embyHost}/Items/${itemId}/PlaybackInfo?MediaSourceId=${mediaSourceId}&api_key=${api_key}&userId=${userId}`;
    r.warn(`itemInfoUri: ${itemInfoUri}`);
    const embyRes = await fetchEmbyFilePath(itemInfoUri, r);
    if (embyRes.startsWith('error')) {
        r.error(embyRes);
        r.return(500, embyRes);
        return;
    }
    r.warn(`mount emby file path: ${embyRes}`);

    //fetch alist direct link
    // 替换挂载根目录embyMountPath
    const alistFilePath = embyRes.replace(embyMountPath, '');
    //第一次尝试请求alist的api获取真实播放路径
    const alistFsGetApiPath = `${alistAddr}/api/fs/get`;
    const alistRes = await fetchAlistPathApi(alistFsGetApiPath, alistFilePath, alistPwd, r);
    if (!alistRes.startsWith('error')) {
        r.warn(`redirect to: ${alistRes}`);
        r.return(302, alistRes);
        return;
    }
    if (alistRes.startsWith('error403')) {
        r.error(alistRes);
        r.return(403, alistRes);
        return;
    }
    if (alistRes.startsWith('error500')) {
        const filePath = alistFilePath.substring(alistFilePath.indexOf('/', 1));
        r.warn(`filePath 路径：${filePath}`);
        //获取alist跟目录，拿到我们挂载的所有网盘目录
        const alistFsListApiPath = `${alistAddr}/api/fs/list`;
        const foldersRes = await fetchAlistPathApi(alistFsListApiPath, '/', alistPwd, r);
        if (foldersRes.startsWith('error')) {
            r.error(foldersRes);
            r.return(500, foldersRes);
            return;
        }
        //如果有多个网盘，会以数组的形式来返回多个跟目录，这里循环进行请求
        const folders = foldersRes.split(',').sort();
        r.warn(`alist网盘列表：${folders}`);
        for (let i = 0; i < folders.length; i++) {
            r.warn(`try to fetch alist path from /${folders[i]}${filePath}`);
            //直接请求网盘跟目录下的路径来获取
            const driverRes = await fetchAlistPathApi(alistFsGetApiPath, `/${folders[i]}${filePath}`, alistPwd, r);
            if (!driverRes.startsWith('error')) {
                r.warn(`redirect to: ${driverRes}`);
                r.return(302, driverRes);
                return;
            }
        }
        r.error(alistRes);
        r.return(404, alistRes);
        return;
    }
    r.error(alistRes);
    r.return(500, alistRes);
    return;
}

async function fetchAlistPathApi(alistApiPath, alistFilePath, alistPwd, r) {
    const alistRequestBody = {
        "path": alistFilePath,
        "password": alistPwd
    }
    try {
        r.warn(`alistApiPath: ${alistApiPath}`);
        r.warn(`alistFilePath: ${alistFilePath}`);
        const response = await ngx.fetch(alistApiPath, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            },
            max_response_body_size: 65535,
            body: JSON.stringify(alistRequestBody)
        })
        r.warn(`alist-response: ${JSON.stringify(response)}`);
        if (response.ok) {
            const result = await response.json();
            if (result === null || result === undefined) {
                return `error: alist_path_api response is null`;
            }
            if (result.message == 'success') {
                // alist v3 
                if(result.data.raw_url) {
                    return result.data.raw_url;
                }
                // 没有的话就按照目录来处理
                return result.data.content.map(item => item.name).join(',');
            }
            if (result.code == 403) {
                return `error403: alist_path_api ${result.message}`;
            }
            return `error500: alist_path_api ${result.code} ${result.message}`;
        }
        else {
            return `error: alist_path_api ${response.status} ${response.statusText}`;
        }
    } catch (error) {
        return (`error: alist_path_api fetchAlistFiled ${error}`);
    }
}

async function fetchEmbyFilePath(itemInfoUri, r) {
    try {
        const res = await ngx.fetch(itemInfoUri, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
            },
            max_response_body_size: 65535,
        });
        if (res.ok) {
            const result = await res.json();
            if (result === null || result === undefined) {
                return `error: emby_api itemInfoUri response is null`;
            }
            r.warn(`result: ${result.MediaSources[0].Path}`);
            return result.MediaSources[0].Path;
        }
        else {
            return (`error: emby_api ${res.status} ${res.statusText}`);
        }
    }
    catch (error) {
        return (`error: emby_api fetch mediaItemInfo failed,  ${error}`);
    }
}

export default { redirect2Pan };
