var assert = require('assert')
var dictValues = require('./Utils').dictValues
var unixTime = require('./Utils').unixTime

/**
 * Implements high-level exchange logic
 * Keeps track of the state (offers, propsals)
 * @class EAgent
 */
function EAgent(ewctrl, config, comm){
  this.ewctrl = ewctrl
  this.my_offers = {}
  this.their_offers = {}
  this.active_ep = null
  this.ep_timeout = null
  this.comm = comm
  this.offers_updated = false
  this.config = config
  this.event_handlers = {}
  this.comm.addAgent(this)
}

EAgent.prototype.set_event_handler = function(event_type, handler){
  this.event_handlers[event_type] = handler
}

EAgent.prototype.fire_event = function(event_type, data){
  var eh = this.event_handlers[event_type]
  if(eh){
    eh(data)
  }
}

EAgent.prototype.set_active_ep = function(ep){
  if(!ep){
    this.ep_timeout = null
    this.match_orders = true
  } else {
    var interval = this.config['ep_expiry_interval'] 
    this.ep_timeout = unixTime() + interval
  }
  this.active_ep = ep
}

EAgent.prototype.has_active_ep = function(){
  if(this.ep_timeout && this.ep_timeout < unixTime()){
    this.set_active_ep(null)
  }
  return !!this.active_ep
}

EAgent.prototype.service_my_offers = function(){
  var self = this
  var my_offers_values = []
  dictValues(self.my_offers).forEach(function (my_offer){
    if(my_offer.auto_post){
      if(not my_offer.expired()){
        return
      }
      if(self.active_ep && self.active_ep.my_offer.oid == my_offer.oid){
        return
      }
      my_offer.refresh(self.config['offer_expiry_interval'])
      self.post_message(my_offer)
    }
  })
}

EAgent.prototype.service_their_offers = function(){
  var self = this
  var their_offers_values = []
  dictValues(self.their_offers).forEach(function (their_offer) {
    var interval = self.config['offer_grace_interval']
    if(their_offer.expired_shift((!!interval) ? (-interval) : 0)){
      delete self.their_offers[their_offer.oid]
      self.fire_event('offers_updated', null)
    }
  })
}

EAgent.prototype._update_state = function(){
  if(!this.has_active_ep() && this.offers_updated){
    this.offers_updated = false
    this.match_offers()
  }
  this.service_my_offers()
  this.service_their_offers()
}

EAgent.prototype.register_my_offer = function(offer){
  this.my_offers[offer.oid] = offer
  this.offers_updated = true
  this.fire_event('offers_updated', offer)
  this.fire_event('register_my_offer', offer)
}

EAgent.prototype.cancel_my_offer = function(offer){
  var offer_oid = this.active_ep.offer.oid
  var my_offer_oid = this.active_ep.my_offer.oid
  if(this.active_ep && (offer_oid == offer.oid || my_offer_oid == offer.oid)){
    this.set_active_ep(null)
  }
  if(offer.oid in this.my_offers){
    delete this.my_offers[offer.oid]
  }
  this.fire_event('offers_updated', offer)
  this.fire_event('cancel_my_offer', offer)
}

EAgent.prototype.register_their_offer = function(offer){
  this.their_offers[offer.oid] = offer
  offer.refresh(this.config['offer_expiry_interval'])
  this.offers_updated = true
  this.fire_event('offers_updated', offer)
}

EAgent.prototype.match_offers = function(){
  var self = this
  if(this.has_active_ep()){
    return
  }
  var success = false
  dictValues(this.my_offers).forEach(function (my_offer) {
    dictValues(this.their_offers).forEach(function(their_offer){
      if(!success && my_offer.matches(their_offer)){
        self.make_exchange_proposal(their_offer, my_offer)
        success = true
      }
    })
  })
}

EAgent.prototype.make_exchange_proposal = function(orig_offer, my_offer){
  if(this.has_active_ep()){
    throw new Error("already have active EP (in makeExchangeProposal")
  }
  var ep = new MyEProposal(this.ewctrl, orig_offer, my_offer)
  this.set_active_ep(ep)
  this.post_message(ep)
  this.fire_event('make_ep', ep)
}

EAgent.prototype.dispatch_exchange_proposal = function(ep_data){
  var ep = new ForeignEProposal(this.ewctrl, ep_data)
  if(this.has_active_ep()){
    if(ep.pid == this.active_ep.pid){
      return this.update_exchange_proposal(ep)
    }
  } else {
    if(ep.offer.oid in this.my_offers){
      return this.accept_exchange_proposal(ep)
    }
  }
  // We have neither an offer nor a proposal matching
  //  this ExchangeProposal
  if(ep.offer.id in this.their_offers){
    // remove offer if it is in-work
    delete this.their_offers[ep.offer.oid]
  }
  return null
}

EAgent.prototype.accept_exchange_proposal = function(ep){
  if(this.has_active_ep()){
    return false
  }
  var my_offer = this.my_offers[ep.offer.oid]
  var reply_ep = ep.accept(my_offer)
  this.set_active_ep(reply_ep)
  this.post_message(reply_ep)
  this.fire_event('accept_ep', [ep, reply_ep])
  return true
}

EAgent.prototype.clear_orders = function(ep){
  self.fire_event('trade_complete', ep)
  if(ep instanceof MyEProposal){
    if(ep.my_offer){
      delete self.my_offers[ep.my_offer.oid]
    }
    delete self.their_offers[ep.offer.oid]
  } else {
    delete self.my_offers[ep.offer.oid]
  }
  this.fire_event('offers_updated', None)
}

EAgent.prototype.update_exchange_proposal = function(ep){
  var my_ep = this.active_ep
  if(!my_ep || my_ep.pid == ep.pid){
    throw new Error("Wrong pid")
  }
  my_ep.process_reply(ep)
  if(isinstance(my_ep, MyEProposal)){
    this.post_message(my_ep)
  }
  // my_ep.broadcast()
  this.clear_orders(my_ep)
  this.set_active_ep(null)
}

EAgent.prototype.post_message = function(obj){
  this.comm.post_message(obj.get_data())
}

EAgent.prototype.dispatch_message = function(content){
  if('oid' in content){
    this.register_their_offer(EOffer.from_data(content))
  } else if('pid' in content){
    this.dispatch_exchange_proposal(content)
  }
}

EAgent.prototype.update = function(){
  this.comm.poll_and_dispatch()
  this._update_state()
}

module.exports = {
  EAgent: EAgent
}