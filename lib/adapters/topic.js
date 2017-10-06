
export default class TopicAdapter {
  /**
  * Params used in this class
  * @method constructor
  * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
  * @return {void}                Returns nothing
  */
  constructor (HTTPAdapter) {
    this.HTTPAdapter = HTTPAdapter;
    this.token       = HTTPAdapter.token;
  }

  loadComments(topic_id, last_comment_id=0, timestamp, after) {
    let params = `token=${this.token}&topic_id=${topic_id}&last_comment_id=${last_comment_id}`;
    if(timestamp) params += `&timestamp=${timestamp}`;
    if(after) params.after += `&after=${after}`;
    return this.HTTPAdapter.get(`api/v2/sdk/load_comments?${params}`)
    .then((res) => {
      return new Promise((resolve, reject) => {
        if(res.status != 200) return new Promise((resolve, reject) => reject(res));
        const data = res.body.results.comments;
        return resolve(data);
      })
    }, (error) => {
      // console.info('failed loading comments', error);
      return new Promise((resolve, reject) => {
        return reject(error);
      });
    })
  }

}
