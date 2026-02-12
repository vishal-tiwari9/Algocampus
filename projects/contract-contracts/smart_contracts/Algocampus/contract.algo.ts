import {
  Contract,
  BoxMap,
  Box,
  GlobalState,
  addr,
  u64,
  Txn,
  itxn,
  assert,
  method
} from '@algorandfoundation/algorand-typescript';

// Data stored for each Event
interface EventData {
  admin: addr;
  fee: u64;
  metadataCID: string; // IPFS CID for Title, Desc, Location
  isGroupEvent: boolean;
  nextUserId: u64; // Counter for 1, 2, 3...
}

// Data stored for each Registration
interface UserData {
  userAddress: addr;
  metadataCID: string; // IPFS CID for Name, College, Proof
}

export class AlgoCampus extends Contract {
  // Global Counter for Event IDs
  totalEvents = GlobalState<u64>({ initialValue: 0 });

  // Map: EventID (u64) -> EventData
  events = BoxMap<u64, EventData>({ keyPrefix: 'e' });

  // Map: EventID + UserID -> UserData (For QR Scan lookup)
  // Key format: `${eventId}_${userId}`
  tickets = BoxMap<string, UserData>({ keyPrefix: 't' });

  // Map: EventID + Address -> UserID (To prevent double registration)
  // Key format: `${eventId}_${address}`
  participantLookup = BoxMap<string, u64>({ keyPrefix: 'p' });

  /**
   * 1. Admin Creates Event
   * URL: /admin/create-singleevent
   */
  @method()
  createEvent(fee: u64, metadataCID: string, isGroup: boolean): u64 {
    const eventId = this.totalEvents.value + 1;
    this.totalEvents.value = eventId;

    this.events(eventId).value = {
      admin: Txn.sender,
      fee: fee,
      metadataCID: metadataCID,
      isGroup: isGroup,
      nextUserId: 1 // Pehla banda jo register karega wo ID 1 hoga
    };

    return eventId;
  }

  /**
   * 2. User Registers (Pays & gets ID)
   * URL: /events/[eventid] -> Register Button
   */
  @method()
  registerUser(eventId: u64, userMetadataCID: string, payment: Txn): u64 {
    assert(this.events(eventId).exists, "Event not found");
    const event = this.events(eventId).value;

    // A. Check Payment
    if (event.fee > 0) {
      assert(payment.amount === event.fee, "Incorrect Fee");
      assert(payment.receiver === event.admin, "Payment must go to Admin");
    }

    // B. Prevent Double Registration
    const lookupKey = `${eventId}_${Txn.sender}`;
    assert(!this.participantLookup(lookupKey).exists, "Already Registered");

    // C. Generate User ID (Sequential 1, 2, 3...)
    const userId = event.nextUserId;

    // D. Store Data (On-Chain Link to Off-Chain IPFS)
    const ticketKey = `${eventId}_${userId}`;
    this.tickets(ticketKey).value = {
      userAddress: Txn.sender,
      metadataCID: userMetadataCID
    };

    // E. Save Lookup & Increment Counter
    this.participantLookup(lookupKey).value = userId;
    event.nextUserId = userId + 1;
    this.events(eventId).value = event;

    return userId; // Frontend will use this for QR Code URL
  }
}