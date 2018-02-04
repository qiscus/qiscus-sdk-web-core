# v1.3.1
- add more params on loadComments
- updated Readme
- add custom template support

# v1.3.0
- open api for publish typing -> core.publishTyping([1|0])
- change submitComment to sendComment
- add getRoomsInfo method -> core.getRoomsInfo({room_ids, room_unique_ids, show_participants, show_removed})
- remove updateCommentStatus() and add readComment(commentId) and receiveComment(commentId)
- add loadComments() method