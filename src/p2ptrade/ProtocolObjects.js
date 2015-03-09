var util = require('util')
var makeRandomId = require('./Utils').makeRandomId
var equal = require('deep-equal');
var WalletCore = require('cc-wallet-core');
var RawTx = WalletCore.tx.RawTx;
var unixTime = require('./Utils').unixTime


/**
 * A is the offer side's ColorValue
 * B is the replyer side's ColorValue
 */
function EOffer(oid, A, B){
  if (oid){
    this.oid = oid
  } else {
    this.oid = makeRandomId()
  }
  this.A = A
  this.B = B
  this.expires = null
}

EOffer.prototype.expired = function(){
  return this.expiredShift(0)
}

EOffer.prototype.expiredShift = function(shift){
  return !!((!this.expires) || (this.expires < (unixTime() + shift)))
}

EOffer.prototype.refresh = function(delta){
  this.expires = unixTime() + delta
}

EOffer.prototype.isSameAsMine = function(my_offer){
  return equal(this.A, my_offer.A) && equal(this.B, my_offer.B)
}

EOffer.prototype.matches = function(offer){
  return equal(this.A, offer.B) && equal(offer.A, this.B)
}

EOffer.prototype.getData = function(){
  return {oid: this.oid, A: this.A, B: this.B}
}

EOffer.fromData = function(data){
  return new EOffer(data['oid'], data['A'], data['B'])
}


/**
 * @class MyEOffer
 * TODO not needed as agent stores my_offers and their_offers seperatly
 */
function MyEOffer(){
  EOffer.apply(this, Array.prototype.slice.call(arguments))
  this.auto_post = true
}

util.inherits(MyEOffer, EOffer)

MyEOffer.fromData = function(data){
  return new MyEOffer(data['oid'], data['A'], data['B'])
}


/**
 * @class ETxSpec
 */
function ETxSpec(inputs, targets, my_utxo_list){
  this.inputs = inputs
  this.targets = targets
  this.my_utxo_list = my_utxo_list
}

ETxSpec.prototype.getData = function(){
  return {inputs:this.inputs, targets:this.targets}
}

ETxSpec.fromData = function(data){
  return new ETxSpec(data['inputs'], data['targets'], null)
}


/**
 * @class EProposal
 */
function EProposal(pid, ewctrl, offer){
  this.pid = pid
  this.ewctrl = ewctrl
  this.offer = offer
}

EProposal.prototype.getData = function(){
  return {pid:this.pid, offer:this.offer.getData()}
}

/**
 * @class MyEProposal
 */
function MyEProposal(ewctrl, orig_offer, my_offer, etx_spec){
  EProposal.apply(this, [makeRandomId(), ewctrl, orig_offer])
  this.my_offer = my_offer
  if(!orig_offer.matches(my_offer)){
    throw new Error("offers are incongruent")
  }
  this.etx_spec = etx_spec
  this.etx_data = undefined
}

util.inherits(MyEProposal, EProposal)

MyEProposal.prototype.getData = function(){
  var res = EProposal.prototype.getData.call(this)
  if(this.etx_data){
    res["etx_data"] = this.etx_data
  } else {
    res["etx_spec"] = this.etx_spec.getData()
  }
  return res
}

MyEProposal.prototype.processReply = function(reply_ep){
  var rtxs = RawTx.fromHex(reply_ep.etx_data)
  if(this.ewctrl.checkTx(rtxs, this.etx_spec)){
    var wallet = this.ewctrl.wallet
    var seedHex = this.ewctrl.getSeedHex()
    var cb = function(error){
      if(error){
        throw Error("Sign raw tx failed!")
      }
    }
    rtxs.sign(wallet, seedHex, cb)
    this.ewctrl.publishTX(rtxs, this.my_offer) 
    this.etx_data = rtxs.toHex(false)
  } else {
    throw new Error("p2ptrade reply tx check failed")
  }
}


/**
 * @class MyReplyEProposal
 */
function MyReplyEProposal(ewctrl, foreign_ep, my_offer, signedTx){
  EProposal.apply(this, [foreign_ep.pid, ewctrl, foreign_ep.offer])
  this.my_offer = my_offer
  this.tx = signedTx
}

util.inherits(MyReplyEProposal, EProposal)

MyReplyEProposal.prototype.getData = function(){
  var data = EProposal.prototype.getData.apply(this)
  data['etx_data'] = this.tx.toHex()
  return data
}

/**
 * @class ForeignEProposal
 */
function ForeignEProposal(ewctrl, ep_data){
  var offer = EOffer.fromData(ep_data['offer'])
  EProposal.apply(this, [ep_data['pid'], ewctrl, offer])
  this.etx_spec = undefined
  if('etx_spec' in ep_data){
    this.etx_spec = ETxSpec.fromData(ep_data['etx_spec'])
  }
  this.etx_data = ep_data['etx_data']
}

util.inherits(ForeignEProposal, EProposal)

ForeignEProposal.prototype.accept = function(my_offer, cb){
  var self = this
  var etxSpec = self.etx_spec
  var our = my_offer.A
  var their = my_offer.B
  self.ewctrl.makeReplyTx(etxSpec, our, their, function(error, signedTx){
    if(error){
      cb(error)
    } else {
      cb(null, new MyReplyEProposal(self.ewctrl, self, my_offer, signedTx))
    }
  })
}

module.exports = {
  EOffer: EOffer,
  MyEOffer: MyEOffer,
  ETxSpec: ETxSpec,
  EProposal: EProposal,
  MyEProposal: MyEProposal,
  MyReplyEProposal: MyReplyEProposal,
  ForeignEProposal: ForeignEProposal
}
