import {expect} from 'chai';
import Comment from '../lib/Comment.js';

describe('Qiscus SDK Core', function() {
  describe('Comment', function() {
    const comment = new Comment({
      type: 'text',
      message: `<script>alert('test')</script>`
    });
    const imageComment = new Comment({
      message: '[file]https://res.cloudinary.com/qiscus/image/upload/kvkfMnaPVv/Screenshot20170913-084754-topic-425-topic.jpg[/file]'
    });

    it('should return a Comment object when instantiated', function() {
      expect(comment).to.be.an.instanceOf(Comment);
    });
    it('should escape special char in message', function(){
      expect(comment.message).be.equal("&lt;script&gt;alert('test')&lt;/script&gt;");
      expect(comment).to.have.property("id");
    });
    it('should return false for properties isPending, isFailed', function(){
      expect(comment.isPending).to.be.false;
      expect(comment.isFailed).to.be.false;
    });
    it('should return true for property isAttachment when the message have [file]...[/file] directive', function(){
      expect(imageComment.isAttachment(imageComment.message)).to.be.true;
    });
    it('should return true for method isImageAttachment when it is an image', function(){
      expect(imageComment.isImageAttachment(imageComment.message)).to.be.true;
    });
    it('should silently fail when the url of the file is invalid', function(){
      expect(imageComment.isImageAttachment('[file]http://[/file]')).to.be.false;
      expect(imageComment.getAttachmentURI('[file]http://[/file]')).be.equal('http://');
    });
    it('should return correct url of [file][/file] directive', function(){
      expect(imageComment.getAttachmentURI('[file]http://www.url.com/gambar.jpg[/file]')).be.equal('http://www.url.com/gambar.jpg');
    });
    it('should give default type of `text` when message type is not supported', function(){
      expect(comment.type).be.equal('text');
    });
    it('should set a unique id if `attachUniqueId` is called', function(){
      comment.attachUniqueId('test');
      expect(comment.unique_id).be.equal('test');
    });
  });
});