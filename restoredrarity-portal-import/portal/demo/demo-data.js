window.RR_DEMO = {
 "customers": [
  {
   "id": "cust-1",
   "name": "Jordan Taylor",
   "email": "jordan@example.com",
   "phone": "(555) 010-2233",
   "internal_notes": "Repeat customer. Prefers text updates.",
   "share_token": "demo-token",
   "storage_key": "demo-sk",
   "created_at": "2026-09-11T17:12:29"
  },
  {
   "id": "cust-2",
   "name": "Sam Rivera",
   "email": "sam@example.com",
   "phone": "",
   "internal_notes": "",
   "share_token": "demo-token-2",
   "storage_key": "demo-sk2",
   "created_at": "2026-10-20T17:12:29"
  }
 ],
 "submissions": [
  {
   "id": "sub-RR-1042",
   "code": "RR-1042",
   "customer_id": "cust-1",
   "status": "restored",
   "service": "Clean + press",
   "public_notes": "Card #1 is done \u2014 see the before/after! Card #2 is next in line.",
   "internal_notes": "Charizard needed 2 press cycles.",
   "customer_notes": "Please be extra careful with the Charizard.",
   "created_at": "2026-10-12T17:12:29",
   "updated_at": "2026-10-21T14:12:29"
  },
  {
   "id": "sub-new",
   "code": "RR-1043",
   "customer_id": "cust-2",
   "status": "submitted",
   "service": "Clean only",
   "public_notes": "",
   "internal_notes": "",
   "customer_notes": "Shipping Friday.",
   "created_at": "2026-10-20T17:12:29",
   "updated_at": "2026-10-20T17:12:29"
  }
 ],
 "cards": [
  {
   "id": "card-RR-1042-1",
   "submission_id": "sub-RR-1042",
   "card_number": 1,
   "name": "Charizard Base Set 4/102",
   "details": "Base Set \u00b7 1999",
   "status": "restored",
   "public_notes": "Whitening on two corners cleaned up; surface pressed flat.",
   "internal_notes": "",
   "customer_notes": "Small crease near top",
   "created_at": "2026-10-12T17:12:29"
  },
  {
   "id": "card-RR-1042-2",
   "submission_id": "sub-RR-1042",
   "card_number": 2,
   "name": "Blastoise 2/102",
   "details": "Base Set \u00b7 1999",
   "status": "in_progress",
   "public_notes": "",
   "internal_notes": "",
   "customer_notes": "",
   "created_at": "2026-10-12T17:12:29"
  },
  {
   "id": "card-new-1",
   "submission_id": "sub-new",
   "card_number": 1,
   "name": "Pikachu",
   "details": "Jungle 60/64",
   "status": "submitted",
   "public_notes": "",
   "internal_notes": "",
   "customer_notes": "",
   "created_at": "2026-10-20T17:12:29"
  },
  {
   "id": "card-new-2",
   "submission_id": "sub-new",
   "card_number": 2,
   "name": "Mewtwo",
   "details": "Base Set 10/102",
   "status": "submitted",
   "public_notes": "",
   "internal_notes": "",
   "customer_notes": "",
   "created_at": "2026-10-20T17:12:29"
  },
  {
   "id": "card-new-3",
   "submission_id": "sub-new",
   "card_number": 3,
   "name": "Gengar",
   "details": "Fossil 5/62",
   "status": "submitted",
   "public_notes": "",
   "internal_notes": "",
   "customer_notes": "",
   "created_at": "2026-10-20T17:12:29"
  }
 ],
 "scans": [
  {
   "id": "scan-0",
   "card_id": "card-RR-1042-1",
   "stage": "after",
   "side": "back",
   "dpi": 600,
   "files": {
    "corners": {
     "top-left": "s/demo-sk/RR-1042/C001/after/corners/back_top-left_demo.jpg",
     "top-right": "s/demo-sk/RR-1042/C001/after/corners/back_top-right_demo.jpg",
     "bottom-right": "s/demo-sk/RR-1042/C001/after/corners/back_bottom-right_demo.jpg",
     "bottom-left": "s/demo-sk/RR-1042/C001/after/corners/back_bottom-left_demo.jpg"
    },
    "edges": {
     "top": "s/demo-sk/RR-1042/C001/after/edges/back_top_demo.jpg",
     "right": "s/demo-sk/RR-1042/C001/after/edges/back_right_demo.jpg",
     "bottom": "s/demo-sk/RR-1042/C001/after/edges/back_bottom_demo.jpg",
     "left": "s/demo-sk/RR-1042/C001/after/edges/back_left_demo.jpg"
    },
    "boxes": {
     "top-left": [
      0.0,
      0.0,
      0.1756,
      0.1271
     ],
     "top-right": [
      0.8244,
      0.0,
      1.0,
      0.1271
     ],
     "bottom-right": [
      0.8244,
      0.8729,
      1.0,
      1.0
     ],
     "bottom-left": [
      0.0,
      0.8729,
      0.1756,
      1.0
     ],
     "top": [
      0.0,
      0.0,
      1.0,
      0.0773
     ],
     "right": [
      0.8931,
      0.0,
      1.0,
      1.0
     ],
     "bottom": [
      0.0,
      0.9227,
      1.0,
      1.0
     ],
     "left": [
      0.0,
      0.0,
      0.1069,
      1.0
     ]
    },
    "centering": {
     "w_in": 2.62,
     "h_in": 3.62,
     "lines": {
      "top@left": {
       "axis": "y",
       "pos": 0.21374,
       "outer": 0.0168,
       "inner": 0.05134,
       "found": false
      },
      "top@right": {
       "axis": "y",
       "pos": 0.78562,
       "outer": 0.0168,
       "inner": 0.05134,
       "found": false
      },
      "bottom@left": {
       "axis": "y",
       "pos": 0.21374,
       "outer": 0.9832,
       "inner": 0.94866,
       "found": false
      },
      "bottom@right": {
       "axis": "y",
       "pos": 0.78562,
       "outer": 0.98366,
       "inner": 0.94913,
       "found": false
      },
      "left@top": {
       "axis": "x",
       "pos": 0.1547,
       "outer": 0.02385,
       "inner": 0.07156,
       "found": false
      },
      "left@bottom": {
       "axis": "x",
       "pos": 0.84484,
       "outer": 0.02385,
       "inner": 0.07156,
       "found": false
      },
      "right@top": {
       "axis": "x",
       "pos": 0.1547,
       "outer": 0.97678,
       "inner": 0.92907,
       "found": false
      },
      "right@bottom": {
       "axis": "x",
       "pos": 0.84484,
       "outer": 0.97678,
       "inner": 0.92907,
       "found": false
      }
     },
     "auto": true,
     "summary": {
      "widths_in": {
       "top@left": 0.125,
       "top@right": 0.125,
       "bottom@left": 0.125,
       "bottom@right": 0.125,
       "left@top": 0.125,
       "left@bottom": 0.125,
       "right@top": 0.125,
       "right@bottom": 0.125
      },
      "check": [],
      "left_in": 0.125,
      "right_in": 0.125,
      "top_in": 0.125,
      "bottom_in": 0.125,
      "lr": [
       50.0,
       50.0
      ],
      "tb": [
       50.0,
       50.0
      ],
      "all_found": false
     }
    },
    "web": "s/demo-sk/RR-1042/C001/after/back_web_demo.jpg",
    "thumb": "s/demo-sk/RR-1042/C001/after/back_thumb_demo.jpg"
   },
   "scanned_at": "2026-10-21T16:47:40"
  },
  {
   "id": "scan-1",
   "card_id": "card-RR-1042-1",
   "stage": "after",
   "side": "front",
   "dpi": 600,
   "files": {
    "corners": {
     "top-left": "s/demo-sk/RR-1042/C001/after/corners/front_top-left_demo.jpg",
     "top-right": "s/demo-sk/RR-1042/C001/after/corners/front_top-right_demo.jpg",
     "bottom-right": "s/demo-sk/RR-1042/C001/after/corners/front_bottom-right_demo.jpg",
     "bottom-left": "s/demo-sk/RR-1042/C001/after/corners/front_bottom-left_demo.jpg"
    },
    "edges": {
     "top": "s/demo-sk/RR-1042/C001/after/edges/front_top_demo.jpg",
     "right": "s/demo-sk/RR-1042/C001/after/edges/front_right_demo.jpg",
     "bottom": "s/demo-sk/RR-1042/C001/after/edges/front_bottom_demo.jpg",
     "left": "s/demo-sk/RR-1042/C001/after/edges/front_left_demo.jpg"
    },
    "boxes": {
     "top-left": [
      0.0,
      0.0,
      0.1753,
      0.127
     ],
     "top-right": [
      0.8247,
      0.0,
      1.0,
      0.127
     ],
     "bottom-right": [
      0.8247,
      0.873,
      1.0,
      1.0
     ],
     "bottom-left": [
      0.0,
      0.873,
      0.1753,
      1.0
     ],
     "top": [
      0.0,
      0.0,
      1.0,
      0.0773
     ],
     "right": [
      0.8933,
      0.0,
      1.0,
      1.0
     ],
     "bottom": [
      0.0,
      0.9227,
      1.0,
      1.0
     ],
     "left": [
      0.0,
      0.0,
      0.1067,
      1.0
     ]
    },
    "centering": {
     "w_in": 2.6233,
     "h_in": 3.6233,
     "lines": {
      "top@left": {
       "axis": "y",
       "pos": 0.21347,
       "outer": 0.01725,
       "inner": 0.06141,
       "found": true
      },
      "top@right": {
       "axis": "y",
       "pos": 0.7859,
       "outer": 0.01725,
       "inner": 0.06141,
       "found": true
      },
      "bottom@left": {
       "axis": "y",
       "pos": 0.21347,
       "outer": 0.98321,
       "inner": 0.95009,
       "found": true
      },
      "bottom@right": {
       "axis": "y",
       "pos": 0.7859,
       "outer": 0.98321,
       "inner": 0.94963,
       "found": true
      },
      "left@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.02446,
       "inner": 0.08863,
       "found": true
      },
      "left@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.02446,
       "inner": 0.08863,
       "found": true
      },
      "right@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.97618,
       "inner": 0.93424,
       "found": true
      },
      "right@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.97618,
       "inner": 0.93424,
       "found": true
      }
     },
     "auto": true,
     "summary": {
      "widths_in": {
       "top@left": 0.16,
       "top@right": 0.16,
       "bottom@left": 0.12,
       "bottom@right": 0.1217,
       "left@top": 0.1683,
       "left@bottom": 0.1683,
       "right@top": 0.11,
       "right@bottom": 0.11
      },
      "check": [],
      "left_in": 0.1683,
      "right_in": 0.11,
      "top_in": 0.16,
      "bottom_in": 0.1208,
      "lr": [
       60.5,
       39.5
      ],
      "tb": [
       57.0,
       43.0
      ],
      "all_found": true
     }
    },
    "web": "s/demo-sk/RR-1042/C001/after/front_web_demo.jpg",
    "thumb": "s/demo-sk/RR-1042/C001/after/front_thumb_demo.jpg"
   },
   "scanned_at": "2026-10-21T16:47:39"
  },
  {
   "id": "scan-2",
   "card_id": "card-RR-1042-1",
   "stage": "before",
   "side": "back",
   "dpi": 600,
   "files": {
    "corners": {
     "top-left": "s/demo-sk/RR-1042/C001/before/corners/back_top-left_demo.jpg",
     "top-right": "s/demo-sk/RR-1042/C001/before/corners/back_top-right_demo.jpg",
     "bottom-right": "s/demo-sk/RR-1042/C001/before/corners/back_bottom-right_demo.jpg",
     "bottom-left": "s/demo-sk/RR-1042/C001/before/corners/back_bottom-left_demo.jpg"
    },
    "edges": {
     "top": "s/demo-sk/RR-1042/C001/before/edges/back_top_demo.jpg",
     "right": "s/demo-sk/RR-1042/C001/before/edges/back_right_demo.jpg",
     "bottom": "s/demo-sk/RR-1042/C001/before/edges/back_bottom_demo.jpg",
     "left": "s/demo-sk/RR-1042/C001/before/edges/back_left_demo.jpg"
    },
    "boxes": {
     "top-left": [
      0.0,
      0.0,
      0.1755,
      0.127
     ],
     "top-right": [
      0.8245,
      0.0,
      1.0,
      0.127
     ],
     "bottom-right": [
      0.8245,
      0.873,
      1.0,
      1.0
     ],
     "bottom-left": [
      0.0,
      0.873,
      0.1755,
      1.0
     ],
     "top": [
      0.0,
      0.0,
      1.0,
      0.0773
     ],
     "right": [
      0.8932,
      0.0,
      1.0,
      1.0
     ],
     "bottom": [
      0.0,
      0.9227,
      1.0,
      1.0
     ],
     "left": [
      0.0,
      0.0,
      0.1068,
      1.0
     ]
    },
    "centering": {
     "w_in": 2.6217,
     "h_in": 3.6233,
     "lines": {
      "top@left": {
       "axis": "y",
       "pos": 0.2136,
       "outer": 0.01771,
       "inner": 0.05221,
       "found": false
      },
      "top@right": {
       "axis": "y",
       "pos": 0.78576,
       "outer": 0.01771,
       "inner": 0.05221,
       "found": false
      },
      "bottom@left": {
       "axis": "y",
       "pos": 0.2136,
       "outer": 0.98321,
       "inner": 0.94871,
       "found": false
      },
      "bottom@right": {
       "axis": "y",
       "pos": 0.78576,
       "outer": 0.98321,
       "inner": 0.94871,
       "found": false
      },
      "left@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.02384,
       "inner": 0.07152,
       "found": false
      },
      "left@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.02384,
       "inner": 0.07152,
       "found": false
      },
      "right@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.97616,
       "inner": 0.92848,
       "found": false
      },
      "right@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.97616,
       "inner": 0.92848,
       "found": false
      }
     },
     "auto": true,
     "summary": {
      "widths_in": {
       "top@left": 0.125,
       "top@right": 0.125,
       "bottom@left": 0.125,
       "bottom@right": 0.125,
       "left@top": 0.125,
       "left@bottom": 0.125,
       "right@top": 0.125,
       "right@bottom": 0.125
      },
      "check": [],
      "left_in": 0.125,
      "right_in": 0.125,
      "top_in": 0.125,
      "bottom_in": 0.125,
      "lr": [
       50.0,
       50.0
      ],
      "tb": [
       50.0,
       50.0
      ],
      "all_found": false
     }
    },
    "web": "s/demo-sk/RR-1042/C001/before/back_web_demo.jpg",
    "thumb": "s/demo-sk/RR-1042/C001/before/back_thumb_demo.jpg"
   },
   "scanned_at": "2026-10-21T16:47:37"
  },
  {
   "id": "scan-3",
   "card_id": "card-RR-1042-1",
   "stage": "before",
   "side": "front",
   "dpi": 600,
   "files": {
    "corners": {
     "top-left": "s/demo-sk/RR-1042/C001/before/corners/front_top-left_demo.jpg",
     "top-right": "s/demo-sk/RR-1042/C001/before/corners/front_top-right_demo.jpg",
     "bottom-right": "s/demo-sk/RR-1042/C001/before/corners/front_bottom-right_demo.jpg",
     "bottom-left": "s/demo-sk/RR-1042/C001/before/corners/front_bottom-left_demo.jpg"
    },
    "edges": {
     "top": "s/demo-sk/RR-1042/C001/before/edges/front_top_demo.jpg",
     "right": "s/demo-sk/RR-1042/C001/before/edges/front_right_demo.jpg",
     "bottom": "s/demo-sk/RR-1042/C001/before/edges/front_bottom_demo.jpg",
     "left": "s/demo-sk/RR-1042/C001/before/edges/front_left_demo.jpg"
    },
    "boxes": {
     "top-left": [
      0.0,
      0.0,
      0.1753,
      0.127
     ],
     "top-right": [
      0.8247,
      0.0,
      1.0,
      0.127
     ],
     "bottom-right": [
      0.8247,
      0.873,
      1.0,
      1.0
     ],
     "bottom-left": [
      0.0,
      0.873,
      0.1753,
      1.0
     ],
     "top": [
      0.0,
      0.0,
      1.0,
      0.0773
     ],
     "right": [
      0.8933,
      0.0,
      1.0,
      1.0
     ],
     "bottom": [
      0.0,
      0.9227,
      1.0,
      1.0
     ],
     "left": [
      0.0,
      0.0,
      0.1067,
      1.0
     ]
    },
    "centering": {
     "w_in": 2.6233,
     "h_in": 3.6233,
     "lines": {
      "top@left": {
       "axis": "y",
       "pos": 0.21347,
       "outer": 0.01771,
       "inner": 0.06187,
       "found": true
      },
      "top@right": {
       "axis": "y",
       "pos": 0.7859,
       "outer": 0.01725,
       "inner": 0.06141,
       "found": true
      },
      "bottom@left": {
       "axis": "y",
       "pos": 0.21347,
       "outer": 0.98321,
       "inner": 0.94963,
       "found": true
      },
      "bottom@right": {
       "axis": "y",
       "pos": 0.7859,
       "outer": 0.98275,
       "inner": 0.94963,
       "found": true
      },
      "left@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.02382,
       "inner": 0.08863,
       "found": true
      },
      "left@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.02382,
       "inner": 0.08863,
       "found": true
      },
      "right@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.97618,
       "inner": 0.93424,
       "found": true
      },
      "right@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.97618,
       "inner": 0.93424,
       "found": true
      }
     },
     "auto": true,
     "summary": {
      "widths_in": {
       "top@left": 0.16,
       "top@right": 0.16,
       "bottom@left": 0.1217,
       "bottom@right": 0.12,
       "left@top": 0.17,
       "left@bottom": 0.17,
       "right@top": 0.11,
       "right@bottom": 0.11
      },
      "check": [],
      "left_in": 0.17,
      "right_in": 0.11,
      "top_in": 0.16,
      "bottom_in": 0.1208,
      "lr": [
       60.7,
       39.3
      ],
      "tb": [
       57.0,
       43.0
      ],
      "all_found": true
     }
    },
    "web": "s/demo-sk/RR-1042/C001/before/front_web_demo.jpg",
    "thumb": "s/demo-sk/RR-1042/C001/before/front_thumb_demo.jpg"
   },
   "scanned_at": "2026-10-21T16:47:37"
  },
  {
   "id": "scan-4",
   "card_id": "card-RR-1042-2",
   "stage": "before",
   "side": "back",
   "dpi": 600,
   "files": {
    "corners": {
     "top-left": "s/demo-sk/RR-1042/C002/before/corners/back_top-left_demo.jpg",
     "top-right": "s/demo-sk/RR-1042/C002/before/corners/back_top-right_demo.jpg",
     "bottom-right": "s/demo-sk/RR-1042/C002/before/corners/back_bottom-right_demo.jpg",
     "bottom-left": "s/demo-sk/RR-1042/C002/before/corners/back_bottom-left_demo.jpg"
    },
    "edges": {
     "top": "s/demo-sk/RR-1042/C002/before/edges/back_top_demo.jpg",
     "right": "s/demo-sk/RR-1042/C002/before/edges/back_right_demo.jpg",
     "bottom": "s/demo-sk/RR-1042/C002/before/edges/back_bottom_demo.jpg",
     "left": "s/demo-sk/RR-1042/C002/before/edges/back_left_demo.jpg"
    },
    "boxes": {
     "top-left": [
      0.0,
      0.0,
      0.1756,
      0.1271
     ],
     "top-right": [
      0.8244,
      0.0,
      1.0,
      0.1271
     ],
     "bottom-right": [
      0.8244,
      0.8729,
      1.0,
      1.0
     ],
     "bottom-left": [
      0.0,
      0.8729,
      0.1756,
      1.0
     ],
     "top": [
      0.0,
      0.0,
      1.0,
      0.0773
     ],
     "right": [
      0.8931,
      0.0,
      1.0,
      1.0
     ],
     "bottom": [
      0.0,
      0.9227,
      1.0,
      1.0
     ],
     "left": [
      0.0,
      0.0,
      0.1069,
      1.0
     ]
    },
    "centering": {
     "w_in": 2.62,
     "h_in": 3.62,
     "lines": {
      "top@left": {
       "axis": "y",
       "pos": 0.21374,
       "outer": 0.0168,
       "inner": 0.05134,
       "found": false
      },
      "top@right": {
       "axis": "y",
       "pos": 0.78562,
       "outer": 0.0168,
       "inner": 0.05134,
       "found": false
      },
      "bottom@left": {
       "axis": "y",
       "pos": 0.21374,
       "outer": 0.98366,
       "inner": 0.94913,
       "found": false
      },
      "bottom@right": {
       "axis": "y",
       "pos": 0.78562,
       "outer": 0.9832,
       "inner": 0.94866,
       "found": false
      },
      "left@top": {
       "axis": "x",
       "pos": 0.1547,
       "outer": 0.02385,
       "inner": 0.07156,
       "found": false
      },
      "left@bottom": {
       "axis": "x",
       "pos": 0.84484,
       "outer": 0.02385,
       "inner": 0.07156,
       "found": false
      },
      "right@top": {
       "axis": "x",
       "pos": 0.1547,
       "outer": 0.97678,
       "inner": 0.92907,
       "found": false
      },
      "right@bottom": {
       "axis": "x",
       "pos": 0.84484,
       "outer": 0.97678,
       "inner": 0.92907,
       "found": false
      }
     },
     "auto": true,
     "summary": {
      "widths_in": {
       "top@left": 0.125,
       "top@right": 0.125,
       "bottom@left": 0.125,
       "bottom@right": 0.125,
       "left@top": 0.125,
       "left@bottom": 0.125,
       "right@top": 0.125,
       "right@bottom": 0.125
      },
      "check": [],
      "left_in": 0.125,
      "right_in": 0.125,
      "top_in": 0.125,
      "bottom_in": 0.125,
      "lr": [
       50.0,
       50.0
      ],
      "tb": [
       50.0,
       50.0
      ],
      "all_found": false
     }
    },
    "web": "s/demo-sk/RR-1042/C002/before/back_web_demo.jpg",
    "thumb": "s/demo-sk/RR-1042/C002/before/back_thumb_demo.jpg"
   },
   "scanned_at": "2026-10-21T16:47:38"
  },
  {
   "id": "scan-5",
   "card_id": "card-RR-1042-2",
   "stage": "before",
   "side": "front",
   "dpi": 600,
   "files": {
    "corners": {
     "top-left": "s/demo-sk/RR-1042/C002/before/corners/front_top-left_demo.jpg",
     "top-right": "s/demo-sk/RR-1042/C002/before/corners/front_top-right_demo.jpg",
     "bottom-right": "s/demo-sk/RR-1042/C002/before/corners/front_bottom-right_demo.jpg",
     "bottom-left": "s/demo-sk/RR-1042/C002/before/corners/front_bottom-left_demo.jpg"
    },
    "edges": {
     "top": "s/demo-sk/RR-1042/C002/before/edges/front_top_demo.jpg",
     "right": "s/demo-sk/RR-1042/C002/before/edges/front_right_demo.jpg",
     "bottom": "s/demo-sk/RR-1042/C002/before/edges/front_bottom_demo.jpg",
     "left": "s/demo-sk/RR-1042/C002/before/edges/front_left_demo.jpg"
    },
    "boxes": {
     "top-left": [
      0.0,
      0.0,
      0.1753,
      0.127
     ],
     "top-right": [
      0.8247,
      0.0,
      1.0,
      0.127
     ],
     "bottom-right": [
      0.8247,
      0.873,
      1.0,
      1.0
     ],
     "bottom-left": [
      0.0,
      0.873,
      0.1753,
      1.0
     ],
     "top": [
      0.0,
      0.0,
      1.0,
      0.0773
     ],
     "right": [
      0.8933,
      0.0,
      1.0,
      1.0
     ],
     "bottom": [
      0.0,
      0.9227,
      1.0,
      1.0
     ],
     "left": [
      0.0,
      0.0,
      0.1067,
      1.0
     ]
    },
    "centering": {
     "w_in": 2.6233,
     "h_in": 3.6233,
     "lines": {
      "top@left": {
       "axis": "y",
       "pos": 0.21347,
       "outer": 0.01725,
       "inner": 0.05589,
       "found": true
      },
      "top@right": {
       "axis": "y",
       "pos": 0.7859,
       "outer": 0.01725,
       "inner": 0.05589,
       "found": true
      },
      "bottom@left": {
       "axis": "y",
       "pos": 0.21347,
       "outer": 0.98321,
       "inner": 0.94411,
       "found": true
      },
      "bottom@right": {
       "axis": "y",
       "pos": 0.7859,
       "outer": 0.98321,
       "inner": 0.94457,
       "found": true
      },
      "left@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.02446,
       "inner": 0.07783,
       "found": true
      },
      "left@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.02446,
       "inner": 0.07719,
       "found": true
      },
      "right@top": {
       "axis": "x",
       "pos": 0.15455,
       "outer": 0.97618,
       "inner": 0.92281,
       "found": true
      },
      "right@bottom": {
       "axis": "x",
       "pos": 0.84499,
       "outer": 0.97618,
       "inner": 0.92281,
       "found": true
      }
     },
     "auto": true,
     "summary": {
      "widths_in": {
       "top@left": 0.14,
       "top@right": 0.14,
       "bottom@left": 0.1417,
       "bottom@right": 0.14,
       "left@top": 0.14,
       "left@bottom": 0.1383,
       "right@top": 0.14,
       "right@bottom": 0.14
      },
      "check": [],
      "left_in": 0.1392,
      "right_in": 0.14,
      "top_in": 0.14,
      "bottom_in": 0.1408,
      "lr": [
       49.8,
       50.2
      ],
      "tb": [
       49.9,
       50.1
      ],
      "all_found": true
     }
    },
    "web": "s/demo-sk/RR-1042/C002/before/front_web_demo.jpg",
    "thumb": "s/demo-sk/RR-1042/C002/before/front_thumb_demo.jpg"
   },
   "scanned_at": "2026-10-21T16:47:38"
  }
 ],
 "photos": [
  {
   "id": "ph-0",
   "customer_id": "cust-1",
   "submission_id": "sub-RR-1042",
   "card_id": "card-RR-1042-1",
   "path": "u/demo-sk/photo0.jpg",
   "source": "intake",
   "caption": "How it arrived \u2014 note the corner",
   "created_at": "2026-10-12T17:12:29"
  },
  {
   "id": "ph-1",
   "customer_id": "cust-1",
   "submission_id": "sub-RR-1042",
   "card_id": "card-RR-1042-1",
   "path": "u/demo-sk/photo1.jpg",
   "source": "intake",
   "caption": "Back of the card",
   "created_at": "2026-10-12T17:12:29"
  },
  {
   "id": "ph-2",
   "customer_id": "cust-1",
   "submission_id": "sub-RR-1042",
   "card_id": null,
   "path": "u/demo-sk/photo2.jpg",
   "source": "customer",
   "caption": "Found this old photo of it from 2003!",
   "created_at": "2026-10-19T17:12:29"
  }
 ]
};
