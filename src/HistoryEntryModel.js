var moment = require('moment')
var HistoryTargetModel = require('./HistoryTargetModel')
var TX_STATUS = require('cc-wallet-core').const.TX_STATUS
var _ = require('lodash')

var statusVsString = _.invert(_.pick(TX_STATUS, _.isNumber))

/**
 * @class HistoryEntryModel
 * @param {cccore.HistoryEntry} historyEntry
 */
function HistoryEntryModel (historyEntry) {
  this.historyEntry = historyEntry
}

/**
 * @return {external:cc-wallet-core.HistoryEntry}
 */
HistoryEntryModel.prototype.getHistoryEntry = function () {
  return this.historyEntry
}

/**
 * @return {string}
 */
HistoryEntryModel.prototype.getTxId = function () {
  return this.historyEntry.getTxId()
}

HistoryEntryModel.prototype.getTxStatus = function () {
  var x = this.historyEntry.getTxStatus()
  return {
    statusCode: x,
    statusString: statusVsString[x]
  }
}

HistoryEntryModel.prototype.getTxStatusEnum = function () {
  return TX_STATUS
}

/**
 * @return {string}
 */
HistoryEntryModel.prototype.getDate = function () {
  var timestamp = this.historyEntry.getTimestamp()
  // Now all historyEntry have timestamp, even unconfirmed
  // if (!timestamp) { return 'unconfirmed' }

  var date = moment(timestamp * 1000).format('MM/DD/YY HH:mm:ss')
  return (this.historyEntry.isBlockTimestamp() ? '~' : '') + date
}

/**
 * @return {string[]}
 */
HistoryEntryModel.prototype.getValues = function () {
  return this.historyEntry.getValues().map(function (av) {
    return av.getAsset().formatValue(av.getValue())
  })
}

HistoryEntryModel.prototype.getTargets = function () {
  return this.historyEntry.getTargets().map(function (at) {
    return new HistoryTargetModel(at)
  })
}

/**
 * @return {boolean}
 */
HistoryEntryModel.prototype.isSend = function () {
  return this.historyEntry.isSend()
}

/**
 * @return {boolean}
 */
HistoryEntryModel.prototype.isTrade = function () {
  return false // @todo
}

/**
 * @return {boolean}
 */
HistoryEntryModel.prototype.isReceive = function () {
  return this.historyEntry.isReceive()
}

/**
 * @return {boolean}
 */
HistoryEntryModel.prototype.isPaymentToYourself = function () {
  return this.historyEntry.isPaymentToYourself()
}

/**
 * @return {string}
 */
HistoryEntryModel.prototype.getTransactionType = function () {
  if (this.isSend()) {
    return 'Send'
  }

  if (this.isReceive()) {
    return 'Receive'
  }

  if (this.isPaymentToYourself()) {
    return 'Payment to yourself'
  }
}

module.exports = HistoryEntryModel
